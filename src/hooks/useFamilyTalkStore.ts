import AsyncStorage from "@react-native-async-storage/async-storage";
import { Firestore } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { mockMeal, mockMembers, mockSchedules, mockVotes, mockWishedMenus } from "../data/mockData";
import { saveFamilyData, subscribeFamilyData } from "../services/familyData";
import { DailyMeal, WishedMenu, FamilyMember, MoodType, ScheduleItem, Vote } from "../types";

const STORAGE_KEY = "familytalk-store-v1";

type PersistedStore = {
  members: FamilyMember[];
  schedules: ScheduleItem[];
  meal: DailyMeal;
  wishedMenus: WishedMenu[];
  votes: Vote[];
};

const isLegacySampleVote = (vote: Vote) => {
  return (
    vote.id === "v1" &&
    vote.topic === "주말 외식 장소" &&
    vote.options.length === 3 &&
    vote.options[0]?.label === "한식당" &&
    vote.options[1]?.label === "피자" &&
    vote.options[2]?.label === "중식"
  );
};

// When familyDb + familyId are provided, all shared data is synced in real time
// through a single Firestore document so every family member sees the same state.
// Otherwise the hook falls back to per-device AsyncStorage (demo/offline mode).
// myUid/myDisplayName identify the signed-in user so they're auto-registered as a
// family member and can only ever change their own mood.
export function useFamilyTalkStore(
  familyDb: Firestore | null = null,
  familyId: string | null = null,
  myUid: string | null = null,
  myDisplayName: string | null = null
) {
  const isSyncMode = Boolean(familyDb && familyId);
  const [members, setMembers] = useState<FamilyMember[]>(mockMembers);
  const [schedules, setSchedules] = useState<ScheduleItem[]>(mockSchedules);
  const [meal, setMeal] = useState<DailyMeal>(mockMeal);
  const [wishedMenus, setWishedMenus] = useState<WishedMenu[]>(mockWishedMenus);
  const [votes, setVotes] = useState<Vote[]>(mockVotes);
  const [isHydrated, setIsHydrated] = useState(false);
  const isApplyingRemoteUpdate = useRef(false);
  // Guards against a stale-render race: when switching between local/sync mode,
  // `isHydrated` from the previous mode can still read `true` in the same effect
  // flush before the new mode's data has loaded. Only a push whose hydration
  // "generation" matches the latest one is allowed to write, so we never persist
  // stale/default data over real data from another device.
  const hydrationGenerationRef = useRef(0);
  const readyGenerationRef = useRef(-1);

  useEffect(() => {
    if (isSyncMode) {
      return;
    }

    let mounted = true;
    const myGeneration = ++hydrationGenerationRef.current;

    const hydrateStore = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
          return;
        }

        const parsed = JSON.parse(raw) as Partial<PersistedStore>;

        if (Array.isArray(parsed.members)) {
          setMembers(parsed.members);
        }

        if (Array.isArray(parsed.schedules)) {
          setSchedules(parsed.schedules);
        }

        if (parsed.meal && typeof parsed.meal === "object") {
          setMeal(parsed.meal as DailyMeal);
        }

        if (Array.isArray(parsed.wishedMenus)) {
          setWishedMenus(parsed.wishedMenus);
        }

        if (Array.isArray(parsed.votes)) {
          setVotes(parsed.votes.filter((vote) => !isLegacySampleVote(vote)));
        }
      } catch {
        // Ignore corrupted local data and continue with defaults.
      } finally {
        if (mounted) {
          readyGenerationRef.current = myGeneration;
          setIsHydrated(true);
        }
      }
    };

    hydrateStore();

    return () => {
      mounted = false;
    };
  }, [isSyncMode]);

  useEffect(() => {
    if (!isSyncMode || !familyDb || !familyId) {
      return;
    }

    setIsHydrated(false);
    let mounted = true;
    let hasSeeded = false;
    const myGeneration = ++hydrationGenerationRef.current;

    const unsubscribe = subscribeFamilyData(
      familyDb,
      familyId,
      (data) => {
        if (!mounted) {
          return;
        }

        if (!data) {
          // No shared state yet for this family: seed it once with the starter data
          // so every member (whoever opens the app first) converges on the same doc.
          if (!hasSeeded) {
            hasSeeded = true;
            saveFamilyData(familyDb, familyId, {
              members: mockMembers,
              schedules: mockSchedules,
              meal: mockMeal,
              wishedMenus: mockWishedMenus,
              votes: mockVotes
            }).catch(() => {
              // Ignore seed failure; next local mutation will retry the write.
            });
          }
          readyGenerationRef.current = myGeneration;
          setIsHydrated(true);
          return;
        }

        isApplyingRemoteUpdate.current = true;
        setMembers(data.members ?? []);
        setSchedules(data.schedules ?? []);
        setMeal(data.meal ?? mockMeal);
        setWishedMenus(data.wishedMenus ?? []);
        setVotes(data.votes ?? []);
        readyGenerationRef.current = myGeneration;
        setIsHydrated(true);
      },
      () => {
        if (mounted) {
          readyGenerationRef.current = myGeneration;
          setIsHydrated(true);
        }
      }
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [isSyncMode, familyDb, familyId]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (hydrationGenerationRef.current !== readyGenerationRef.current) {
      // A newer hydration cycle (mode/family switch) has started but hasn't
      // finished yet; this render's data is stale, so skip persisting it.
      return;
    }

    if (isApplyingRemoteUpdate.current) {
      isApplyingRemoteUpdate.current = false;
      return;
    }

    if (isSyncMode && familyDb && familyId) {
      saveFamilyData(familyDb, familyId, { members, schedules, meal, wishedMenus, votes }).catch(() => {
        // Ignore write failures to avoid blocking UI interaction; next change retries.
      });
      return;
    }

    const persistedState: PersistedStore = {
      members,
      schedules,
      meal,
      wishedMenus,
      votes
    };

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState)).catch(() => {
      // Ignore storage failures to avoid blocking UI interaction.
    });
  }, [isHydrated, isSyncMode, familyDb, familyId, members, schedules, meal, wishedMenus, votes]);

  useEffect(() => {
    if (!isHydrated || !myUid) {
      return;
    }

    setMembers((prev) => {
      const existing = prev.find((member) => member.id === myUid);

      if (existing) {
        if (myDisplayName && existing.name !== myDisplayName) {
          return prev.map((member) => (member.id === myUid ? { ...member, name: myDisplayName } : member));
        }
        return prev;
      }

      if (!myDisplayName) {
        return prev;
      }

      return [...prev, { id: myUid, uid: myUid, name: myDisplayName, isOnline: true, mood: "normal" }];
    });
  }, [isHydrated, myUid, myDisplayName]);

  const todaySchedules = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();

    return schedules
      .filter((item) => {
        const dt = new Date(item.dateTime);
        return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
      })
      .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
  }, [schedules]);

  const setMyMood = (mood: MoodType) => {
    if (!myUid) {
      return;
    }

    setMembers((prev) => prev.map((m) => (m.id === myUid ? { ...m, mood } : m)));
  };

  const updateMealStatus = (status: DailyMeal["status"]) => {
    setMeal((prev) => ({ ...prev, status }));
  };

  const updateMealInfo = (title: string, shoppingMemo?: string) => {
    setMeal((prev) => ({
      ...prev,
      title,
      shoppingMemo: shoppingMemo?.trim() ? shoppingMemo.trim() : undefined
    }));
  };

  const deleteMeal = () => {
    setMeal({
      id: `m-${Date.now()}`,
      title: "",
      status: "home"
    });
  };

  const addWishedMenu = (title: string, status: WishedMenu["status"]) => {
    if (!title.trim()) {
      return;
    }

    const wishedMenu: WishedMenu = {
      id: `w-${Date.now()}`,
      title: title.trim(),
      status
    };

    setWishedMenus((prev) => [...prev, wishedMenu]);
  };

  const deleteWishedMenu = (menuId: string) => {
    setWishedMenus((prev) => prev.filter((menu) => menu.id !== menuId));
  };

  const voteOption = (voteId: string, optionId: string) => {
    setVotes((prevVotes) =>
      prevVotes.map((vote) => {
        if (vote.id !== voteId) {
          return vote;
        }

        const previousChoice = vote.userVotedOptionId;
        const options = vote.options.map((option) => {
          if (option.id === optionId) {
            const increment = previousChoice === optionId ? 0 : 1;
            return { ...option, count: option.count + increment };
          }

          if (previousChoice && option.id === previousChoice) {
            return { ...option, count: Math.max(0, option.count - 1) };
          }

          return option;
        });

        return { ...vote, options, userVotedOptionId: optionId };
      })
    );
  };

  const addSchedule = (title: string, date: string, time: string, isFamilyEvent: boolean) => {
    let dateTime = new Date().toISOString();
    
    // Parse date string (format: "YYYY-MM-DD") and create datetime
    if (date) {
      const dateParts = date.split('-');
      if (dateParts.length === 3) {
        const year = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1;
        const day = parseInt(dateParts[2], 10);
        const d = new Date(year, month, day, 0, 0, 0);
        dateTime = d.toISOString();
      }
    }
    
    const newItem: ScheduleItem = {
      id: `s-${Date.now()}`,
      title,
      dateTime,
      time: time.trim() || undefined,
      isFamilyEvent,
      ownerName: isFamilyEvent ? "가족" : "나"
    };

    setSchedules((prev) => [...prev, newItem]);
  };

  const deleteSchedule = (scheduleId: string) => {
    setSchedules((prev) => prev.filter((item) => item.id !== scheduleId));
  };

  const addVote = (topic: string, optionLabels: string[]) => {
    const options = optionLabels
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label, index) => ({
        id: `o-${Date.now()}-${index}`,
        label,
        count: 0
      }));

    if (!topic.trim() || options.length < 2) {
      return;
    }

    const vote: Vote = {
      id: `v-${Date.now()}`,
      topic: topic.trim(),
      options
    };

    setVotes((prev) => [vote, ...prev]);
  };

  const deleteVote = (voteId: string) => {
    setVotes((prev) => prev.filter((vote) => vote.id !== voteId));
  };

  return {
    members,
    schedules,
    todaySchedules,
    meal,
    wishedMenus,
    votes,
    setMyMood,
    updateMealStatus,
    updateMealInfo,
    deleteMeal,
    addWishedMenu,
    deleteWishedMenu,
    voteOption,
    addSchedule,
    deleteSchedule,
    addVote,
    deleteVote
  };
}
