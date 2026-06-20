import { DailyMeal, FamilyMember, ScheduleItem, Vote } from "../types";

export const mockMembers: FamilyMember[] = [];

export const mockSchedules: ScheduleItem[] = [];

export const mockMeal: DailyMeal = {
  id: "meal-1",
  title: "",
  status: "home"
};

export const mockVotes: Vote[] = [
  {
    id: "v1",
    topic: "주말 외식 장소",
    options: [
      { id: "o1", label: "한식당", count: 2 },
      { id: "o2", label: "피자", count: 1 },
      { id: "o3", label: "중식", count: 0 }
    ]
  }
];
