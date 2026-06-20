export type MoodType = "happy" | "normal" | "tired" | "sick";
export type MealStatus = "home" | "eat_out";

export interface FamilyMember {
  id: string;
  name: string;
  role: string;
  isOnline: boolean;
  mood: MoodType;
}

export interface ScheduleItem {
  id: string;
  title: string;
  dateTime: string;
  isFamilyEvent: boolean;
  ownerName: string;
}

export interface DailyMeal {
  id: string;
  title: string;
  status: MealStatus;
  shoppingMemo?: string;
}

export interface VoteOption {
  id: string;
  label: string;
  count: number;
}

export interface Vote {
  id: string;
  topic: string;
  options: VoteOption[];
  userVotedOptionId?: string;
}

export interface HomeSnapshot {
  todaySchedules: ScheduleItem[];
  todayMeal: DailyMeal;
  members: FamilyMember[];
}
