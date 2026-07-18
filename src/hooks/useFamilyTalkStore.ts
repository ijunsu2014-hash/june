import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";
import { mockMeal, mockMembers, mockSchedules, mockVotes, mockWishedMenus } from "../data/mockData";
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

export function useFamilyTalkStore() {
  const [members, setMembers] = useState<FamilyMember[]>(mockMembers);
  const [schedules, setSchedules] = useState<ScheduleItem[]>(mockSchedules);
  const [meal, setMeal] = useState<DailyMeal>(mockMeal);
  const [wishedMenus, setWishedMenus] = useState<WishedMenu[]>(mockWishedMenus);
  const [votes, setVotes] = useState<Vote[]>(mockVotes);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;

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
          setIsHydrated(true);
        }
      }
    };

    hydrateStore();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) {
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
  }, [isHydrated, members, schedules, meal, wishedMenus, votes]);

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

  const setMemberMood = (memberId: string, mood: MoodType) => {
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, mood } : m)));
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

  const addMember = (name: string, role: string) => {
    if (!name.trim() || !role.trim()) {
      return;
    }

    const member: FamilyMember = {
      id: `m-${Date.now()}`,
      name: name.trim(),
      role: role.trim(),
      isOnline: true,
      mood: "normal"
    };

    setMembers((prev) => [...prev, member]);
  };

  const deleteMember = (memberId: string) => {
    setMembers((prev) => prev.filter((member) => member.id !== memberId));
  };

  return {
    members,
    schedules,
    todaySchedules,
    meal,
    wishedMenus,
    votes,
    setMemberMood,
    updateMealStatus,
    updateMealInfo,
    deleteMeal,
    addWishedMenu,
    deleteWishedMenu,
    voteOption,
    addSchedule,
    deleteSchedule,
    addVote,
    deleteVote,
    addMember,
    deleteMember
  };
}
