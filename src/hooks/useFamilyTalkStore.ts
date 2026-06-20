import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";
import { mockMeal, mockMembers, mockSchedules, mockVotes } from "../data/mockData";
import { DailyMeal, FamilyMember, MoodType, ScheduleItem, Vote } from "../types";

const STORAGE_KEY = "familytalk-store-v1";

type PersistedStore = {
  members: FamilyMember[];
  schedules: ScheduleItem[];
  meal: DailyMeal;
  votes: Vote[];
};

export function useFamilyTalkStore() {
  const [members, setMembers] = useState<FamilyMember[]>(mockMembers);
  const [schedules, setSchedules] = useState<ScheduleItem[]>(mockSchedules);
  const [meal, setMeal] = useState<DailyMeal>(mockMeal);
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

        if (Array.isArray(parsed.votes)) {
          setVotes(parsed.votes);
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
      votes
    };

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState)).catch(() => {
      // Ignore storage failures to avoid blocking UI interaction.
    });
  }, [isHydrated, members, schedules, meal, votes]);

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

  const addSchedule = (title: string, isFamilyEvent: boolean) => {
    const newItem: ScheduleItem = {
      id: `s-${Date.now()}`,
      title,
      dateTime: new Date().toISOString(),
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

  return {
    members,
    schedules,
    todaySchedules,
    meal,
    votes,
    setMemberMood,
    updateMealStatus,
    updateMealInfo,
    voteOption,
    addSchedule,
    deleteSchedule,
    addVote,
    addMember
  };
}
