import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as CryptoJS from "crypto-js";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  User,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { useFamilyTalkStore } from "./src/hooks/useFamilyTalkStore";
import { auth, db, isFirebaseConfigured } from "./src/services/firebase";
import {
  FamilyMembership,
  FamilyProfile,
  createFamilyAndJoin,
  generateFamilyCode,
  getFamilyProfile,
  getUserMembership,
  joinFamilyWithCode
} from "./src/services/familyRoom";
import { colors, darkColors, mealMeta, moodMeta } from "./src/theme";
import { DailyMeal, FamilyMember, ScheduleItem, Vote, WishedMenu } from "./src/types";

type TabKey = "home" | "schedule" | "vote" | "family" | "settings";

const tabs: { key: TabKey; label: string }[] = [
  { key: "home", label: "홈" },
  { key: "schedule", label: "일정" },
  { key: "vote", label: "투표" },
  { key: "family", label: "가족" },
  { key: "settings", label: "설정" }
];

type ThemeColors = typeof colors;
type DeleteTargetType = "schedule" | "member" | "vote" | "meal" | "wishedMenu";
const THEME_STORAGE_KEY = "familytalk-theme-v1";
const LOCAL_AUTH_STORAGE_KEY = "familytalk-local-auth-v1";
const LOCAL_FAMILY_STORE_KEY = "familytalk-local-family-store-v1";
const LOCAL_ACCOUNT_STORAGE_KEY = "familytalk-local-accounts-v1";
const MAX_JOIN_FAIL_COUNT = 5;
const JOIN_LOCK_SECONDS = 30;

type LocalAuthUser = {
  uid: string;
  nickname: string;
  email?: string;
};

type LocalAccountRecord = {
  uid: string;
  nickname: string;
  emailKey: string;
  email?: string;
  passwordHash: string;
};

type LocalFamilyRecord = {
  id: string;
  name: string;
  codeHash: string;
  createdByUid: string;
  codeCipher?: string;
};

type LocalFamilyStore = {
  families: LocalFamilyRecord[];
  memberships: Record<string, FamilyMembership>;
};

const WEEKDAY_SHORT_KR = ["월", "화", "수", "목", "금", "토", "일"];
const SOLAR_HOLIDAY_NAME_MAP: Record<string, string> = {
  "01-01": "신정",
  "03-01": "삼일절",
  "05-05": "어린이날",
  "06-06": "현충일",
  "08-15": "광복절",
  "10-03": "개천절",
  "10-09": "한글날",
  "12-25": "성탄절"
};

const toMondayIndex = (day: number) => (day === 0 ? 6 : day - 1);

const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const isHoliday = (date: Date) => {
  const md = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return Boolean(SOLAR_HOLIDAY_NAME_MAP[md]);
};

const getHolidayName = (date: Date) => {
  const md = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return SOLAR_HOLIDAY_NAME_MAP[md];
};

const formatTodayText = (date: Date) => {
  const weekLabel = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} (${weekLabel})`;
};

function SectionCard({
  title,
  children,
  headerRight,
  themeColors
}: {
  title: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  themeColors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {headerRight}
      </View>
      {children}
    </View>
  );
}

function AuthBrand({ themeColors }: { themeColors: ThemeColors }) {
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  return (
    <View style={styles.brandWrap}>
      <View style={styles.brandLogoBox}>
        <View style={styles.brandCircleBubble}>
          <View style={styles.brandCircleBubbleTail} />
        </View>
      </View>
      <Text style={styles.brandTitle}>패밀리톡</Text>
      <Text style={styles.brandSubtitle}>우리 가족의 하루를 함께 기록해요</Text>
    </View>
  );
}

function HomeScreen({
  todaySchedules,
  schedules,
  meal,
  wishedMenus,
  members,
  onMealStatus,
  onMealUpdate,
  onAddWishedMenu,
  onRequestDeleteSchedule,
  onRequestDeleteMeal,
  onRequestDeleteWishedMenu,
  themeColors
}: {
  todaySchedules: ScheduleItem[];
  schedules: ScheduleItem[];
  meal: DailyMeal;
  wishedMenus: WishedMenu[];
  members: FamilyMember[];
  onMealStatus: (status: DailyMeal["status"]) => void;
  onMealUpdate: (title: string, shoppingMemo?: string) => void;
  onAddWishedMenu: (title: string, status: DailyMeal["status"]) => void;
  onRequestDeleteSchedule: (scheduleId: string) => void;
  onRequestDeleteMeal: () => void;
  onRequestDeleteWishedMenu: (menuId: string) => void;
  themeColors: ThemeColors;
}) {
  const [mealTitle, setMealTitle] = useState(meal.title);
  const [wishedMenuTitle, setWishedMenuTitle] = useState("");
  const [wishedMenuStatus, setWishedMenuStatus] = useState<DailyMeal["status"]>("home");
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const monthlyCalendar = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = toMondayIndex(first.getDay());
    const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7;

    const scheduleByDate = new Map<string, ScheduleItem[]>();
    schedules.forEach((item) => {
      const key = toDateKey(new Date(item.dateTime));
      const existing = scheduleByDate.get(key) ?? [];
      existing.push(item);
      scheduleByDate.set(key, existing);
    });

    const cells = Array.from({ length: totalCells }, (_, index) => {
      const day = index - offset + 1;
      if (day < 1 || day > daysInMonth) {
        return null;
      }

      const date = new Date(year, month, day);
      const key = toDateKey(date);
      const items = (scheduleByDate.get(key) ?? []).sort(
        (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
      );

      return {
        key,
        date,
        day,
        isSaturday: date.getDay() === 6,
        isSunday: date.getDay() === 0,
        isHoliday: isHoliday(date),
        holidayName: getHolidayName(date),
        items
      };
    });

    return {
      title: `${year}년 ${month + 1}월`,
      cells
    };
  }, [calendarMonth, schedules]);

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionCard
          title="오늘 일정"
          headerRight={
            <Pressable
              style={styles.calendarOpenButton}
              onPress={() => {
                const now = new Date();
                setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                setIsCalendarVisible(true);
              }}
            >
              <Text style={styles.calendarOpenButtonText}>달력</Text>
            </Pressable>
          }
          themeColors={themeColors}
        >
        {todaySchedules.length === 0 ? (
          <Text style={styles.muted}>오늘 등록된 일정이 없습니다.</Text>
        ) : (
          todaySchedules.map((item) => (
            <View key={item.id} style={styles.scheduleItem}>
              <View style={styles.scheduleTextWrap}>
                <Text style={styles.mainText}>{item.title}</Text>
                <Text style={styles.scheduleTypeText}>{item.isFamilyEvent ? "가족 일정" : "개인 일정"}</Text>
              </View>
              <Pressable onPress={() => onRequestDeleteSchedule(item.id)} style={styles.deleteButton}>
                <Text style={styles.deleteButtonText}>삭제</Text>
              </Pressable>
            </View>
          ))
        )}
        </SectionCard>

        <SectionCard title="오늘의 식단" themeColors={themeColors}>
        <TextInput
          value={mealTitle}
          onChangeText={setMealTitle}
          placeholder="식단 제목 입력"
          placeholderTextColor={themeColors.textSecondary}
          style={styles.input}
        />
        <Pressable
          style={styles.buttonPrimary}
          onPress={() => {
            if (!mealTitle.trim()) {
              return;
            }
            onMealUpdate(mealTitle.trim());
          }}
        >
          <Text style={styles.buttonPrimaryText}>식단 추가</Text>
        </Pressable>
        <View style={styles.chipRow}>
          {(Object.keys(mealMeta) as DailyMeal["status"][]).map((status) => (
            <Pressable
              key={status}
              onPress={() => onMealStatus(status)}
              style={[styles.chip, meal.status === status && styles.chipSelected]}
            >
              <Text style={styles.chipLabel}>{mealMeta[status].label}</Text>
            </Pressable>
          ))}
        </View>
        {meal.title ? (
          <View style={styles.mealItem}>
            <View style={styles.mealItemLeft}>
              <Text style={styles.mealItemTitle}>{meal.title}</Text>
              <Text style={styles.mealItemStatus}>{mealMeta[meal.status].label}</Text>
            </View>
            <Pressable onPress={() => onRequestDeleteMeal()} style={styles.deleteButton}>
              <Text style={styles.deleteButtonText}>삭제</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.muted}>등록된 식단이 없습니다.</Text>
        )}
        </SectionCard>

        <SectionCard title="희망 메뉴" themeColors={themeColors}>
        <TextInput
          value={wishedMenuTitle}
          onChangeText={setWishedMenuTitle}
          placeholder="메뉴 이름 입력"
          placeholderTextColor={themeColors.textSecondary}
          style={styles.input}
        />
        <Pressable
          style={styles.buttonPrimary}
          onPress={() => {
            if (!wishedMenuTitle.trim()) {
              return;
            }
            onAddWishedMenu(wishedMenuTitle.trim(), wishedMenuStatus);
            setWishedMenuTitle("");
          }}
        >
          <Text style={styles.buttonPrimaryText}>희망메뉴 추가</Text>
        </Pressable>
        <View style={styles.chipRow}>
          {(Object.keys(mealMeta) as DailyMeal["status"][]).map((status) => (
            <Pressable
              key={status}
              onPress={() => setWishedMenuStatus(status)}
              style={[styles.chip, wishedMenuStatus === status && styles.chipSelected]}
            >
              <Text style={styles.chipLabel}>{mealMeta[status].label}</Text>
            </Pressable>
          ))}
        </View>
        {wishedMenus.length === 0 ? (
          <Text style={styles.muted}>등록된 희망 메뉴가 없습니다.</Text>
        ) : (
          wishedMenus.map((menu) => (
            <View key={menu.id} style={styles.mealItem}>
              <View style={styles.mealItemLeft}>
                <Text style={styles.mealItemTitle}>{menu.title}</Text>
                <Text style={styles.mealItemStatus}>{mealMeta[menu.status].label}</Text>
              </View>
              <Pressable onPress={() => onRequestDeleteWishedMenu(menu.id)} style={styles.deleteButton}>
                <Text style={styles.deleteButtonText}>삭제</Text>
              </Pressable>
            </View>
          ))
        )}
        </SectionCard>

        <SectionCard title="가족 컨디션" themeColors={themeColors}>
        {members.length === 0 ? (
          <Text style={styles.muted}>아직 등록된 가족 구성원이 없습니다.</Text>
        ) : (
          members.map((member) => (
            <View style={styles.rowBetween} key={member.id}>
              <Text style={styles.mainText}>{member.name}</Text>
              <Text style={styles.badge}>
                {moodMeta[member.mood].emoji} {moodMeta[member.mood].label}
              </Text>
            </View>
          ))
        )}
        </SectionCard>
      </ScrollView>

      <Modal visible={isCalendarVisible} transparent animationType="fade" onRequestClose={() => setIsCalendarVisible(false)}>
        <View style={styles.calendarModalRoot}>
          <Pressable style={styles.calendarBackdrop} onPress={() => setIsCalendarVisible(false)} />
          <View style={styles.calendarPanel}>
            <View style={styles.rowBetween}>
              <Pressable
                style={styles.calendarMonthMoveButton}
                onPress={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              >
                <Text style={styles.calendarCloseButtonText}>이전</Text>
              </Pressable>
              <Text style={styles.calendarMonthTitle}>{monthlyCalendar.title}</Text>
              <Pressable
                style={styles.calendarMonthMoveButton}
                onPress={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              >
                <Text style={styles.calendarCloseButtonText}>다음</Text>
              </Pressable>
            </View>
            <View style={styles.calendarWeekHeaderRow}>
              {WEEKDAY_SHORT_KR.map((label, idx) => (
                <Text
                  key={label}
                  style={[
                    styles.calendarWeekHeaderText,
                    idx === 5 && styles.calendarSaturdayText,
                    idx === 6 && styles.calendarSundayHolidayText
                  ]}
                >
                  {label}
                </Text>
              ))}
            </View>
            <ScrollView>
              <View style={styles.calendarGrid}>
                {monthlyCalendar.cells.map((cell, idx) => {
                  if (!cell) {
                    return <View key={`empty-${idx}`} style={styles.calendarCell} />;
                  }

                  const dayTextStyle = [
                    styles.calendarDayNumber,
                    cell.isSaturday && styles.calendarSaturdayText,
                    (cell.isSunday || cell.isHoliday) && styles.calendarSundayHolidayText
                  ];

                  return (
                    <View key={cell.key} style={styles.calendarCell}>
                      <Text style={dayTextStyle}>{cell.day}</Text>
                      {cell.holidayName ? <Text style={styles.calendarHolidayName}>{cell.holidayName}</Text> : null}
                      {cell.items.slice(0, 2).map((item) => (
                        <Text key={item.id} style={styles.calendarEventText} numberOfLines={1}>
                          {item.title}
                        </Text>
                      ))}
                      {cell.items.length > 2 ? <Text style={styles.calendarEventMore}>+{cell.items.length - 2}</Text> : null}
                    </View>
                  );
                })}
                </View>
            </ScrollView>
            <View style={styles.calendarFooter}>
              <Pressable style={styles.calendarCloseButton} onPress={() => setIsCalendarVisible(false)}>
                <Text style={styles.calendarCloseButtonText}>닫기</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function ScheduleScreen({
  schedules,
  scheduleCount,
  onAdd,
  onRequestDelete,
  themeColors
}: {
  schedules: ScheduleItem[];
  scheduleCount: number;
  onAdd: (title: string, isFamily: boolean) => void;
  onRequestDelete: (scheduleId: string) => void;
  themeColors: ThemeColors;
}) {
  const [title, setTitle] = useState("");
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionCard title="일정 추가" themeColors={themeColors}>
        <Text style={styles.subtleCount}>현재 일정 수 : {scheduleCount}개</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="일정 입력"
          placeholderTextColor={themeColors.textSecondary}
          style={styles.input}
        />
        <View style={styles.rowGap}>
          <Pressable
            style={styles.buttonPrimary}
            onPress={() => {
              if (!title.trim()) {
                return;
              }
              onAdd(title.trim(), true);
              setTitle("");
            }}
          >
            <Text style={styles.buttonPrimaryText}>일정 추가</Text>
          </Pressable>
        </View>
      </SectionCard>

      <SectionCard title="등록된 일정" themeColors={themeColors}>
        {schedules.length === 0 ? (
          <Text style={styles.muted}>아직 등록된 일정이 없습니다.</Text>
        ) : (
          schedules.map((item) => (
            <View key={item.id} style={styles.scheduleItem}>
              <View style={styles.scheduleTextWrap}>
                <Text style={styles.mainText}>{item.title}</Text>
                <Text style={styles.scheduleTypeText}>{item.isFamilyEvent ? "가족 일정" : "개인 일정"}</Text>
              </View>
              <Pressable onPress={() => onRequestDelete(item.id)} style={styles.deleteButton}>
                <Text style={styles.deleteButtonText}>삭제</Text>
              </Pressable>
            </View>
          ))
        )}
      </SectionCard>
    </ScrollView>
  );
}

function VoteScreen({
  votes,
  onVote,
  onCreateVote,
  onRequestDeleteVote,
  themeColors
}: {
  votes: Vote[];
  onVote: (voteId: string, optionId: string) => void;
  onCreateVote: (topic: string, options: string[]) => void;
  onRequestDeleteVote: (voteId: string) => void;
  themeColors: ThemeColors;
}) {
  const [topic, setTopic] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionCard title="투표 만들기" themeColors={themeColors}>
        <TextInput
          value={topic}
          onChangeText={setTopic}
          placeholder="투표 주제 입력"
          placeholderTextColor={themeColors.textSecondary}
          style={styles.input}
        />
        <TextInput
          value={optionsText}
          onChangeText={setOptionsText}
          placeholder="선택지 쉼표로 구분 (예: 가, 나, 다)"
          placeholderTextColor={themeColors.textSecondary}
          style={styles.input}
        />
        <Pressable
          style={styles.buttonPrimary}
          onPress={() => {
            const options = optionsText
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);
            if (!topic.trim() || options.length < 2) {
              return;
            }
            onCreateVote(topic.trim(), options);
            setTopic("");
            setOptionsText("");
          }}
        >
          <Text style={styles.buttonPrimaryText}>직접 투표 추가</Text>
        </Pressable>
      </SectionCard>

      {votes.map((vote) => {
        const total = vote.options.reduce((sum, option) => sum + option.count, 0);
        return (
          <SectionCard key={vote.id} title={vote.topic} themeColors={themeColors}>
            {vote.options.map((option) => {
              const ratio = total === 0 ? 0 : Math.round((option.count / total) * 100);
              const selected = vote.userVotedOptionId === option.id;
              return (
                <Pressable
                  key={option.id}
                  style={[styles.voteItem, selected && styles.voteItemSelected]}
                  onPress={() => onVote(vote.id, option.id)}
                >
                  <Text style={styles.mainText}>{option.label}</Text>
                  <Text style={styles.muted}>{option.count}표 ({ratio}%)</Text>
                </Pressable>
              );
            })}
            <View style={styles.rowBetween}>
              <View />
              <Pressable style={styles.deleteButton} onPress={() => onRequestDeleteVote(vote.id)}>
                <Text style={styles.deleteButtonText}>삭제</Text>
              </Pressable>
            </View>
          </SectionCard>
        );
      })}
    </ScrollView>
  );
}

function SettingsScreen({
  isDarkMode,
  onToggleDarkMode,
  canDeleteAccount,
  isDeleteAccountPending,
  accountActionError,
  onDeleteAccount,
  canRevealFamilyCode,
  isFamilyCodeVisible,
  familyCode,
  onToggleFamilyCode,
  themeColors
}: {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  canDeleteAccount: boolean;
  isDeleteAccountPending: boolean;
  accountActionError: string;
  onDeleteAccount: () => void;
  canRevealFamilyCode: boolean;
  isFamilyCodeVisible: boolean;
  familyCode: string;
  onToggleFamilyCode: () => void;
  themeColors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionCard title="테마" themeColors={themeColors}>
        <View style={styles.rowBetween}>
          <Text style={styles.mainText}>{isDarkMode ? "다크 모드" : "라이트 모드"}</Text>
          <Pressable style={styles.buttonPrimary} onPress={onToggleDarkMode}>
            <Text style={styles.buttonPrimaryText}>{isDarkMode ? "라이트 모드" : "다크 모드"}</Text>
          </Pressable>
        </View>
      </SectionCard>

      <SectionCard title="가족 코드" themeColors={themeColors}>
        {canRevealFamilyCode ? (
          <>
            <Text style={styles.securityCode}>{isFamilyCodeVisible ? familyCode : "•••••-•••••"}</Text>
            <Pressable style={styles.buttonSecondary} onPress={onToggleFamilyCode}>
              <Text style={styles.buttonSecondaryText}>{isFamilyCodeVisible ? "코드 숨기기" : "코드 보기"}</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.muted}>현재 계정으로는 가족 코드를 확인할 수 없습니다.</Text>
        )}
      </SectionCard>

      {canDeleteAccount ? (
        <SectionCard title="계정" themeColors={themeColors}>
          <Text style={styles.muted}>탈퇴하면 현재 계정 세션이 종료됩니다.</Text>
          <Pressable style={styles.buttonDanger} onPress={onDeleteAccount} disabled={isDeleteAccountPending}>
            <Text style={styles.buttonDangerText}>{isDeleteAccountPending ? "처리 중..." : "탈퇴"}</Text>
          </Pressable>
          {accountActionError ? <Text style={styles.authErrorText}>{accountActionError}</Text> : null}
        </SectionCard>
      ) : null}
    </ScrollView>
  );
}

function FamilyScreen({
  members,
  onMood,
  onAddMember,
  onRequestDeleteMember,
  themeColors
}: {
  members: FamilyMember[];
  onMood: (memberId: string, mood: FamilyMember["mood"]) => void;
  onAddMember: (name: string, role: string) => void;
  onRequestDeleteMember: (memberId: string) => void;
  themeColors: ThemeColors;
}) {
  const moods = useMemo(() => Object.keys(moodMeta) as FamilyMember["mood"][], []);
  const [name, setName] = useState("");
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionCard title="가족 구성원 추가" themeColors={themeColors}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="이름 입력"
          placeholderTextColor={themeColors.textSecondary}
          style={styles.input}
        />
        <Pressable
          style={styles.buttonPrimary}
          onPress={() => {
            if (!name.trim()) {
              return;
            }
            onAddMember(name.trim(), "가족");
            setName("");
          }}
        >
          <Text style={styles.buttonPrimaryText}>직접 가족 추가</Text>
        </Pressable>
      </SectionCard>

      {members.length === 0 ? (
        <SectionCard title="가족 구성원" themeColors={themeColors}>
          <Text style={styles.muted}>아직 등록된 가족 구성원이 없습니다.</Text>
        </SectionCard>
      ) : (
        members.map((member) => (
          <SectionCard key={member.id} title={member.name} themeColors={themeColors}>
            <View style={styles.rowBetween}>
              <Text style={styles.muted}>온라인: {member.isOnline ? "접속 중" : "오프라인"}</Text>
              <Pressable style={styles.deleteButton} onPress={() => onRequestDeleteMember(member.id)}>
                <Text style={styles.deleteButtonText}>삭제</Text>
              </Pressable>
            </View>
            <View style={styles.chipRow}>
              {moods.map((mood) => (
                <Pressable
                  key={mood}
                  onPress={() => onMood(member.id, mood)}
                  style={[styles.chip, member.mood === mood && styles.chipSelected]}
                >
                  <Text style={styles.chipLabel}>
                    {moodMeta[mood].emoji} {moodMeta[mood].label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </SectionCard>
        ))
      )}
    </ScrollView>
  );
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("home");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [localAuthUser, setLocalAuthUser] = useState<LocalAuthUser | null>(null);
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const [familyReady, setFamilyReady] = useState(!isFirebaseConfigured);
  const [familyMembership, setFamilyMembership] = useState<FamilyMembership | null>(null);
  const [familyProfile, setFamilyProfile] = useState<FamilyProfile | null>(null);
  const [familyStep, setFamilyStep] = useState<"create" | "join">("create");
  const [familyNameInput, setFamilyNameInput] = useState("");
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [familyError, setFamilyError] = useState("");
  const [familyPending, setFamilyPending] = useState(false);
  const [issuedFamilyCode, setIssuedFamilyCode] = useState("");
  const [showFamilyCode, setShowFamilyCode] = useState(false);
  const [settingsFamilyCode, setSettingsFamilyCode] = useState("");
  const [showSettingsFamilyCode, setShowSettingsFamilyCode] = useState(false);
  const [joinFailCount, setJoinFailCount] = useState(0);
  const [joinLockedUntil, setJoinLockedUntil] = useState<number | null>(null);
  const [joinRemainSeconds, setJoinRemainSeconds] = useState(0);
  const [isDeleteAccountPending, setIsDeleteAccountPending] = useState(false);
  const [accountActionError, setAccountActionError] = useState("");
  const [isWithdrawConfirmVisible, setIsWithdrawConfirmVisible] = useState(false);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetType, setDeleteTargetType] = useState<DeleteTargetType>("schedule");
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [isSignupConfirmVisible, setIsSignupConfirmVisible] = useState(false);
  const [sheetAnim] = useState(() => new Animated.Value(0));
  const [signupSheetAnim] = useState(() => new Animated.Value(0));
  const [withdrawSheetAnim] = useState(() => new Animated.Value(0));
  const [themeFadeAnim] = useState(() => new Animated.Value(1));
  const [isThemeAnimating, setIsThemeAnimating] = useState(false);
  const [isThemeHydrated, setIsThemeHydrated] = useState(false);
  const themeColors = isDarkMode ? darkColors : colors;
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const todayHeaderText = useMemo(() => formatTodayText(new Date()), []);
  const {
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
  } = useFamilyTalkStore();

  useEffect(() => {
    let mounted = true;

    const hydrateTheme = async () => {
      try {
        const rawTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (rawTheme === "dark") {
          setIsDarkMode(true);
        }
      } catch {
        // Ignore theme restore failure and keep default mode.
      } finally {
        if (mounted) {
          setIsThemeHydrated(true);
        }
      }
    };

    hydrateTheme();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isThemeHydrated) {
      return;
    }

    AsyncStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? "dark" : "light").catch(() => {
      // Ignore theme persistence failure to avoid blocking UI interaction.
    });
  }, [isDarkMode, isThemeHydrated]);

  useEffect(() => {
    if (isFirebaseConfigured) {
      return;
    }

    let mounted = true;

    const hydrateLocalAuth = async () => {
      try {
        const raw =
          (await AsyncStorage.getItem(LOCAL_AUTH_STORAGE_KEY)) ||
          (typeof localStorage !== "undefined" ? localStorage.getItem(LOCAL_AUTH_STORAGE_KEY) : null);
        if (!raw) {
          return;
        }

        const parsed = JSON.parse(raw) as LocalAuthUser;
        const fallbackNickname = parsed?.email ? parsed.email.split("@")[0] : "사용자";
        if (parsed?.uid && mounted) {
          setLocalAuthUser({
            uid: parsed.uid,
            nickname: parsed.nickname || fallbackNickname,
            email: parsed.email
          });
        }
      } catch {
        // Ignore local auth restore failures in demo mode.
      } finally {
        if (mounted) {
          setAuthReady(true);
        }
      }
    };

    hydrateLocalAuth();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      setAuthError("");
      setFamilyError("");
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const safeDb = db;

    let mounted = true;
    setFamilyReady(false);

    const hydrateFamily = async () => {
      try {
        if (isFirebaseConfigured && safeDb) {
          if (!currentUser) {
            if (!mounted) {
              return;
            }

            setFamilyMembership(null);
            setFamilyProfile(null);
            setIssuedFamilyCode("");
            return;
          }

          const membership = await getUserMembership(safeDb, currentUser.uid);

          if (!mounted) {
            return;
          }

          if (!membership) {
            setFamilyMembership(null);
            setFamilyProfile(null);
            return;
          }

          setFamilyMembership(membership);
          const profile = await getFamilyProfile(safeDb, membership.familyId);

          if (!mounted) {
            return;
          }

          setFamilyProfile(profile);
          return;
        }

        if (!localAuthUser) {
          setFamilyMembership(null);
          setFamilyProfile(null);
          setSettingsFamilyCode("");
          setShowSettingsFamilyCode(false);
          return;
        }

        const rawStore = await AsyncStorage.getItem(LOCAL_FAMILY_STORE_KEY);
        const localStore: LocalFamilyStore = rawStore
          ? (JSON.parse(rawStore) as LocalFamilyStore)
          : { families: [], memberships: {} };

        const membership = localStore.memberships[localAuthUser.uid];
        if (!membership) {
          setFamilyMembership(null);
          setFamilyProfile(null);
          setSettingsFamilyCode("");
          setShowSettingsFamilyCode(false);
          return;
        }

        const family = localStore.families.find((item) => item.id === membership.familyId) ?? null;
        setFamilyMembership(membership);
        setFamilyProfile(family ? { id: family.id, name: family.name } : null);

        if (membership.role === "owner" && family?.codeCipher) {
          const decoded = decryptLocalFamilyCode(family.codeCipher, localAuthUser.uid);
          setSettingsFamilyCode(decoded);
        } else {
          setSettingsFamilyCode("");
          setShowSettingsFamilyCode(false);
        }
      } catch {
        if (!mounted) {
          return;
        }

        setFamilyError("가족 방 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (mounted) {
          setFamilyReady(true);
        }
      }
    };

    hydrateFamily();

    return () => {
      mounted = false;
    };
  }, [currentUser, localAuthUser]);

  useEffect(() => {
    if (!joinLockedUntil) {
      setJoinRemainSeconds(0);
      return;
    }

    const updateRemain = () => {
      const remain = Math.max(0, Math.ceil((joinLockedUntil - Date.now()) / 1000));
      setJoinRemainSeconds(remain);

      if (remain === 0) {
        setJoinLockedUntil(null);
        setJoinFailCount(0);
      }
    };

    updateRemain();
    const timer = setInterval(updateRemain, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [joinLockedUntil]);

  const normalizeJoinCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);

  const formatJoinCode = (value: string) => {
    const normalized = normalizeJoinCode(value);
    if (normalized.length <= 5) {
      return normalized;
    }

    return `${normalized.slice(0, 5)}-${normalized.slice(5)}`;
  };

  const resolveErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return fallback;
  };

  const isSignedIn = isFirebaseConfigured ? Boolean(currentUser) : Boolean(localAuthUser);
  const activeUserId = isFirebaseConfigured ? currentUser?.uid ?? null : localAuthUser?.uid ?? null;
  const activeUserLabel = isFirebaseConfigured
    ? currentUser?.email ?? null
    : localAuthUser?.nickname || localAuthUser?.email || null;

  const normalizeCodeForHash = (value: string) => normalizeJoinCode(value);
  const hashFamilyCode = (normalizedCode: string) =>
    CryptoJS.SHA256(`${normalizedCode}|familytalk-code-v1`).toString(CryptoJS.enc.Hex);

  const getLocalCodeCipherKey = (uid: string) => `familytalk-local-code-v1|${uid}`;
  const encryptLocalFamilyCode = (code: string, uid: string) =>
    CryptoJS.AES.encrypt(code, getLocalCodeCipherKey(uid)).toString();
  const decryptLocalFamilyCode = (cipher: string, uid: string) => {
    const bytes = CryptoJS.AES.decrypt(cipher, getLocalCodeCipherKey(uid));
    return bytes.toString(CryptoJS.enc.Utf8);
  };

  const loadLocalFamilyStore = async (): Promise<LocalFamilyStore> => {
    const rawStore = await AsyncStorage.getItem(LOCAL_FAMILY_STORE_KEY);
    if (!rawStore) {
      return { families: [], memberships: {} };
    }

    return JSON.parse(rawStore) as LocalFamilyStore;
  };

  const saveLocalFamilyStore = async (store: LocalFamilyStore) => {
    await AsyncStorage.setItem(LOCAL_FAMILY_STORE_KEY, JSON.stringify(store));
  };

  const persistLocalAuthUser = async (user: LocalAuthUser) => {
    const serialized = JSON.stringify(user);
    await AsyncStorage.setItem(LOCAL_AUTH_STORAGE_KEY, serialized);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, serialized);
    }
  };

  const clearPersistedLocalAuthUser = async () => {
    await AsyncStorage.removeItem(LOCAL_AUTH_STORAGE_KEY);
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(LOCAL_AUTH_STORAGE_KEY);
    }
  };

  const loadLocalAccounts = async (): Promise<LocalAccountRecord[]> => {
    const raw =
      (await AsyncStorage.getItem(LOCAL_ACCOUNT_STORAGE_KEY)) ||
      (typeof localStorage !== "undefined" ? localStorage.getItem(LOCAL_ACCOUNT_STORAGE_KEY) : null);

    if (!raw) {
      return [];
    }

    return JSON.parse(raw) as LocalAccountRecord[];
  };

  const saveLocalAccounts = async (accounts: LocalAccountRecord[]) => {
    const serialized = JSON.stringify(accounts);
    await AsyncStorage.setItem(LOCAL_ACCOUNT_STORAGE_KEY, serialized);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LOCAL_ACCOUNT_STORAGE_KEY, serialized);
    }
  };

  const getLocalPasswordHash = (emailKey: string, passwordValue: string) =>
    CryptoJS.SHA256(`local-auth-v1|${emailKey}|${passwordValue}`).toString(CryptoJS.enc.Hex);

  const handleCreateFamily = async () => {
    if (!activeUserId) {
      return;
    }

    setFamilyPending(true);
    setFamilyError("");

    try {
      if (isFirebaseConfigured && db) {
        const result = await createFamilyAndJoin(db, activeUserId, familyNameInput, displayNameInput);
        setFamilyMembership(result.membership);
        setFamilyProfile(result.profile);
        setIssuedFamilyCode(result.familyCode);
      } else {
        const safeFamilyName = familyNameInput.trim();
        const safeDisplayName = displayNameInput.trim();

        if (!safeFamilyName || !safeDisplayName) {
          throw new Error("가족 이름과 내 이름을 입력해 주세요.");
        }

        const localStore = await loadLocalFamilyStore();
        if (localStore.memberships[activeUserId]) {
          throw new Error("이미 참여 중인 가족 방이 있습니다.");
        }

        let generatedCode = "";
        let codeHash = "";
        let attempts = 0;

        while (attempts < 10) {
          generatedCode = generateFamilyCode();
          codeHash = hashFamilyCode(normalizeCodeForHash(generatedCode));
          if (!localStore.families.some((family) => family.codeHash === codeHash)) {
            break;
          }

          attempts += 1;
        }

        if (!generatedCode || !codeHash || attempts >= 10) {
          throw new Error("코드 생성에 실패했습니다. 다시 시도해 주세요.");
        }

        const familyId = `lf-${Date.now()}`;
        localStore.families.push({
          id: familyId,
          name: safeFamilyName,
          codeHash,
          createdByUid: activeUserId,
          codeCipher: encryptLocalFamilyCode(generatedCode, activeUserId)
        });
        localStore.memberships[activeUserId] = {
          familyId,
          role: "owner",
          displayName: safeDisplayName
        };

        await saveLocalFamilyStore(localStore);

        setFamilyMembership(localStore.memberships[activeUserId]);
        setFamilyProfile({ id: familyId, name: safeFamilyName });
        setIssuedFamilyCode(generatedCode);
        setSettingsFamilyCode(generatedCode);
        setShowSettingsFamilyCode(false);
      }

      setShowFamilyCode(false);
      setFamilyNameInput("");
      setJoinCodeInput("");
      setJoinFailCount(0);
      setJoinLockedUntil(null);
    } catch (error) {
      setFamilyError(resolveErrorMessage(error, "가족 방 생성에 실패했습니다. 다시 시도해 주세요."));
    } finally {
      setFamilyPending(false);
    }
  };

  const handleJoinFamily = async () => {
    if (!activeUserId) {
      return;
    }

    if (joinLockedUntil && joinLockedUntil > Date.now()) {
      setFamilyError(`코드 입력 시도가 많아 잠시 잠겼어요. ${joinRemainSeconds}초 후 다시 시도해 주세요.`);
      return;
    }

    setFamilyPending(true);
    setFamilyError("");

    try {
      if (isFirebaseConfigured && db) {
        const result = await joinFamilyWithCode(db, activeUserId, joinCodeInput, displayNameInput);
        setFamilyMembership(result.membership);
        setFamilyProfile(result.profile);
      } else {
        const safeDisplayName = displayNameInput.trim();
        if (!safeDisplayName) {
          throw new Error("내 이름을 입력해 주세요.");
        }

        const normalizedCode = normalizeCodeForHash(joinCodeInput);
        if (normalizedCode.length < 8) {
          throw new Error("코드 형식이 올바르지 않습니다.");
        }

        const localStore = await loadLocalFamilyStore();
        if (localStore.memberships[activeUserId]) {
          throw new Error("이미 참여 중인 가족 방이 있습니다.");
        }

        const codeHash = hashFamilyCode(normalizedCode);
        const family = localStore.families.find((item) => item.codeHash === codeHash);
        if (!family) {
          throw new Error("코드가 일치하지 않습니다.");
        }

        localStore.memberships[activeUserId] = {
          familyId: family.id,
          role: "member",
          displayName: safeDisplayName
        };

        await saveLocalFamilyStore(localStore);

        setFamilyMembership(localStore.memberships[activeUserId]);
        setFamilyProfile({ id: family.id, name: family.name });
        setSettingsFamilyCode("");
        setShowSettingsFamilyCode(false);
      }

      setIssuedFamilyCode("");
      setJoinCodeInput("");
      setJoinFailCount(0);
      setJoinLockedUntil(null);
    } catch (error) {
      const nextFailCount = joinFailCount + 1;
      setJoinFailCount(nextFailCount);

      if (nextFailCount >= MAX_JOIN_FAIL_COUNT) {
        const nextLockedUntil = Date.now() + JOIN_LOCK_SECONDS * 1000;
        setJoinLockedUntil(nextLockedUntil);
      }

      setFamilyError(resolveErrorMessage(error, "가족 코드 확인에 실패했습니다. 다시 시도해 주세요."));
    } finally {
      setFamilyPending(false);
    }
  };

  const runAuthAction = async (mode: "login" | "signup") => {
    if (!nickname.trim() || !email.trim() || !password.trim()) {
      setAuthError("닉네임, 이메일, 비밀번호를 모두 입력해 주세요.");
      return;
    }

    if (password.trim().length < 4) {
      setAuthError("비밀번호는 최소 4자 이상이어야 합니다.");
      return;
    }

    setAuthPending(true);
    setAuthError("");

    try {
      if (!isFirebaseConfigured) {
        const normalizedNickname = nickname.trim();
        const normalizedEmail = email.trim().toLowerCase();
        const emailKey = normalizedEmail;
        const localAccounts = await loadLocalAccounts();
        const account = localAccounts.find((item) => item.emailKey === emailKey);

        if (mode === "signup") {
          if (account) {
            setAuthError("이미 존재하는 계정입니다.");
            return;
          }

          const uidHash = CryptoJS.SHA256(`local-user:${emailKey}`).toString(CryptoJS.enc.Hex).slice(0, 24);
          const nextAccount: LocalAccountRecord = {
            uid: `local-${uidHash}`,
            nickname: normalizedNickname,
            emailKey,
            email: normalizedEmail || undefined,
            passwordHash: getLocalPasswordHash(emailKey, password)
          };

          await saveLocalAccounts([...localAccounts, nextAccount]);

          const localUser = {
            uid: nextAccount.uid,
            nickname: nextAccount.nickname,
            email: nextAccount.email
          };
          setLocalAuthUser(localUser);
          await persistLocalAuthUser(localUser);
          setAuthReady(true);
          return;
        }

        if (!account) {
          setAuthError("존재하지 않는 계정입니다.");
          return;
        }

        if (account.nickname !== normalizedNickname) {
          setAuthError("닉네임이 일치하지 않습니다.");
          return;
        }

        const expectedHash = getLocalPasswordHash(emailKey, password);
        if (account.passwordHash !== expectedHash) {
          setAuthError("비밀번호가 올바르지 않습니다.");
          return;
        }

        const localUser = {
          uid: account.uid,
          nickname: account.nickname,
          email: account.email
        };

        setLocalAuthUser(localUser);
        await persistLocalAuthUser(localUser);
        setAuthReady(true);
      } else {
        if (!auth) {
          throw new Error("인증 초기화에 실패했습니다.");
        }

        if (!email.trim()) {
          setAuthError("현재 모드에서는 이메일이 필요합니다.");
          return;
        }

        if (mode === "signup") {
          await createUserWithEmailAndPassword(auth, email.trim(), password);
        } else {
          await signInWithEmailAndPassword(auth, email.trim(), password);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "인증 중 오류가 발생했습니다.";
      setAuthError(message);
    } finally {
      setAuthPending(false);
    }
  };

  const handleSignOut = async () => {
    try {
      if (isFirebaseConfigured) {
        if (!auth) {
          return;
        }

        await signOut(auth);
      } else {
        setLocalAuthUser(null);
        await clearPersistedLocalAuthUser();
      }

      setFamilyMembership(null);
      setFamilyProfile(null);
      setIssuedFamilyCode("");
      setSettingsFamilyCode("");
      setShowSettingsFamilyCode(false);
      setFamilyError("");
      setFamilyStep("create");
      setFamilyReady(true);
      setAccountActionError("");
    } catch {
      setAuthError("로그아웃에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  const handleDeleteAccount = async () => {
    if (!activeUserId) {
      return;
    }

    setIsDeleteAccountPending(true);
    setAccountActionError("");

    try {
      if (isFirebaseConfigured) {
        if (!auth?.currentUser) {
          throw new Error("로그인 상태를 확인할 수 없습니다.");
        }

        await deleteUser(auth.currentUser);
        setCurrentUser(null);
      } else {
        const localStore = await loadLocalFamilyStore();
        const removedMembership = localStore.memberships[activeUserId];

        if (removedMembership) {
          delete localStore.memberships[activeUserId];

          const hasMemberInFamily = Object.values(localStore.memberships).some(
            (membership) => membership.familyId === removedMembership.familyId
          );

          if (!hasMemberInFamily) {
            localStore.families = localStore.families.filter((family) => family.id !== removedMembership.familyId);
          }

          await saveLocalFamilyStore(localStore);
        }

        await clearPersistedLocalAuthUser();
        setLocalAuthUser(null);
      }

      setFamilyMembership(null);
      setFamilyProfile(null);
      setIssuedFamilyCode("");
      setSettingsFamilyCode("");
      setShowSettingsFamilyCode(false);
      setFamilyError("");
      setFamilyStep("create");
      setFamilyReady(true);
    } catch (error) {
      const fallback =
        "탈퇴에 실패했습니다. 다시 로그인 후 시도해 주세요.";
      const message = error instanceof Error ? error.message : fallback;
      setAccountActionError(message || fallback);
    } finally {
      setIsDeleteAccountPending(false);
    }
  };

  const openDeleteModal = (targetId: string, targetType: DeleteTargetType = "schedule") => {
    setDeleteTargetId(targetId);
    setDeleteTargetType(targetType);
    setIsDeleteModalVisible(true);
    sheetAnim.setValue(0);
    Animated.timing(sheetAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  };

  const closeDeleteModal = () => {
    Animated.timing(sheetAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true
    }).start(() => {
      setIsDeleteModalVisible(false);
      setDeleteTargetId(null);
      setDeleteTargetType("schedule");
    });
  };

  const openSignupConfirmModal = () => {
    setIsSignupConfirmVisible(true);
    signupSheetAnim.setValue(0);
    Animated.timing(signupSheetAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  };

  const closeSignupConfirmModal = (onClosed?: () => void) => {
    Animated.timing(signupSheetAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true
    }).start(() => {
      setIsSignupConfirmVisible(false);
      onClosed?.();
    });
  };

  const confirmSignupAction = () => {
    closeSignupConfirmModal(() => {
      runAuthAction("signup");
    });
  };

  const openWithdrawConfirmModal = () => {
    setIsWithdrawConfirmVisible(true);
    withdrawSheetAnim.setValue(0);
    Animated.timing(withdrawSheetAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  };

  const closeWithdrawConfirmModal = (onClosed?: () => void) => {
    Animated.timing(withdrawSheetAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true
    }).start(() => {
      setIsWithdrawConfirmVisible(false);
      onClosed?.();
    });
  };

  const confirmWithdrawAction = () => {
    closeWithdrawConfirmModal(() => {
      handleDeleteAccount();
    });
  };

  const confirmDeleteTarget = () => {
    if (deleteTargetId) {
      if (deleteTargetType === "schedule") {
        deleteSchedule(deleteTargetId);
      } else if (deleteTargetType === "vote") {
        deleteVote(deleteTargetId);
      } else if (deleteTargetType === "member") {
        deleteMember(deleteTargetId);
      } else if (deleteTargetType === "meal") {
        deleteMeal();
      } else if (deleteTargetType === "wishedMenu") {
        deleteWishedMenu(deleteTargetId);
      }
    }
    closeDeleteModal();
  };

  const toggleDarkMode = () => {
    if (isThemeAnimating) {
      return;
    }

    setIsThemeAnimating(true);

    Animated.timing(themeFadeAnim, {
      toValue: 0.72,
      duration: 280,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true
    }).start(({ finished }) => {
      if (!finished) {
        setIsThemeAnimating(false);
        return;
      }

      setIsDarkMode((prev) => !prev);

      requestAnimationFrame(() => {
        Animated.timing(themeFadeAnim, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }).start(() => {
          setIsThemeAnimating(false);
        });
      });
    });
  };

  const backdropOpacity = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1]
  });

  const sheetTranslateY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 0]
  });

  const signupBackdropOpacity = signupSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1]
  });

  const signupSheetTranslateY = signupSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 0]
  });

  const withdrawBackdropOpacity = withdrawSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1]
  });

  const withdrawSheetTranslateY = withdrawSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 0]
  });

  if (isFirebaseConfigured && !authReady) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style={isDarkMode ? "light" : "dark"} />
        <View style={styles.authContainer}>
          <Text style={styles.muted}>로그인 상태를 확인하는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isSignedIn) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style={isDarkMode ? "light" : "dark"} />
        <View style={styles.authContainer}>
          <AuthBrand themeColors={themeColors} />
          <View style={styles.authCard}>
            <Text style={styles.authTitle}>패밀리톡 계정</Text>

            <TextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder="닉네임"
              autoCapitalize="none"
              placeholderTextColor={themeColors.textSecondary}
              style={[styles.input, styles.authInput]}
            />

            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="이메일"
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor={themeColors.textSecondary}
              style={[styles.input, styles.authInput]}
            />
            <View style={styles.passwordRow}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="비밀번호"
                secureTextEntry={!showPassword}
                placeholderTextColor={themeColors.textSecondary}
                style={[styles.input, styles.authInput, styles.passwordInput]}
              />
              <Pressable style={styles.passwordToggleButton} onPress={() => setShowPassword((prev) => !prev)}>
                <Text style={styles.passwordToggleText}>{showPassword ? "숨김" : "표시"}</Text>
              </Pressable>
            </View>
            <Text style={styles.muted}>보안을 위해 비밀번호는 최소 4자 이상이어야 합니다.</Text>

            {authError ? <Text style={styles.authErrorText}>{authError}</Text> : null}

            <View style={styles.authActionRow}>
              <Pressable
                style={[styles.buttonSecondary, styles.authActionButton]}
                onPress={openSignupConfirmModal}
                disabled={authPending}
              >
                <Text style={styles.buttonSecondaryText}>{authPending ? "처리 중..." : "회원가입"}</Text>
              </Pressable>
              <Pressable
                style={[styles.buttonPrimary, styles.authActionButton]}
                onPress={() => runAuthAction("login")}
                disabled={authPending}
              >
                <Text style={styles.buttonPrimaryText}>{authPending ? "처리 중..." : "로그인"}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <Modal
          visible={isSignupConfirmVisible}
          transparent
          animationType="none"
          onRequestClose={() => closeSignupConfirmModal()}
        >
          <View style={styles.modalRoot}>
            <Animated.View style={[styles.modalBackdrop, { opacity: signupBackdropOpacity }]}>
              <Pressable style={styles.modalBackdropPressable} onPress={() => closeSignupConfirmModal()} />
            </Animated.View>

            <Animated.View
              style={[
                styles.deleteSheet,
                {
                  opacity: signupSheetAnim,
                  transform: [{ translateY: signupSheetTranslateY }]
                }
              ]}
            >
              <Text style={styles.deleteSheetTitle}>회원가입하시겠습니까?</Text>
              <View style={styles.deleteSheetButtons}>
                <Pressable style={styles.deleteSheetCancelButton} onPress={() => closeSignupConfirmModal()}>
                  <Text style={styles.deleteSheetCancelText}>취소</Text>
                </Pressable>
                <Pressable style={styles.deleteSheetConfirmButton} onPress={confirmSignupAction}>
                  <Text style={styles.deleteSheetConfirmText}>네</Text>
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  if (isSignedIn && !familyReady) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style={isDarkMode ? "light" : "dark"} />
        <View style={styles.authContainer}>
          <Text style={styles.muted}>가족 방 정보를 확인하는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isSignedIn && !familyMembership) {
    const joinLocked = Boolean(joinLockedUntil && joinLockedUntil > Date.now());

    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style={isDarkMode ? "light" : "dark"} />
        <View style={styles.authContainer}>
          <AuthBrand themeColors={themeColors} />
          <View style={styles.authCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.authTitle}>가족 방 시작하기</Text>
              <Pressable style={styles.buttonSecondary} onPress={handleSignOut}>
                <Text style={styles.buttonSecondaryText}>뒤로 가기</Text>
              </Pressable>
            </View>

            <View style={styles.authActionRow}>
              <Pressable
                style={[styles.buttonSecondary, styles.authActionButton]}
                onPress={() => {
                  setFamilyStep("create");
                  setFamilyError("");
                }}
              >
                <Text style={styles.buttonSecondaryText}>가족 코드 만들기</Text>
              </Pressable>
              <Pressable
                style={[styles.buttonPrimary, styles.authActionButton]}
                onPress={() => {
                  setFamilyStep("join");
                  setFamilyError("");
                }}
              >
                <Text style={styles.buttonPrimaryText}>코드로 참여하기</Text>
              </Pressable>
            </View>

            <TextInput
              value={displayNameInput}
              onChangeText={setDisplayNameInput}
              placeholder="내 이름"
              placeholderTextColor={themeColors.textSecondary}
              style={styles.input}
            />

            {familyStep === "create" ? (
              <>
                <TextInput
                  value={familyNameInput}
                  onChangeText={setFamilyNameInput}
                  placeholder="가족 방 이름 입력"
                  placeholderTextColor={themeColors.textSecondary}
                  style={styles.input}
                />
                <Pressable style={styles.buttonPrimary} onPress={handleCreateFamily} disabled={familyPending}>
                  <Text style={styles.buttonPrimaryText}>{familyPending ? "생성 중..." : "가족 코드 만들기"}</Text>
                </Pressable>

                {issuedFamilyCode ? (
                  <View style={styles.securityCard}>
                    <Text style={styles.securityTitle}>발급된 가족 코드</Text>
                    <Text style={styles.securityCode}>{showFamilyCode ? issuedFamilyCode : "•••••-•••••"}</Text>
                    <Pressable style={styles.buttonSecondary} onPress={() => setShowFamilyCode((prev) => !prev)}>
                      <Text style={styles.buttonSecondaryText}>{showFamilyCode ? "코드 숨기기" : "코드 보기"}</Text>
                    </Pressable>
                    <Text style={styles.securityHint}>코드는 가족에게만 공유하세요. 분실 시 새 가족 방을 만드는 것을 권장합니다.</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <TextInput
                  value={joinCodeInput}
                  onChangeText={(value) => setJoinCodeInput(formatJoinCode(value))}
                  placeholder="가족 코드 입력 (예: ABC12-3DE45)"
                  autoCapitalize="characters"
                  placeholderTextColor={themeColors.textSecondary}
                  style={styles.input}
                />
                <Pressable
                  style={[styles.buttonPrimary, joinLocked && styles.buttonDisabled]}
                  onPress={handleJoinFamily}
                  disabled={familyPending || joinLocked}
                >
                  <Text style={styles.buttonPrimaryText}>
                    {joinLocked
                      ? `${joinRemainSeconds}초 후 재시도`
                      : familyPending
                        ? "참여 중..."
                        : "가족 방 참여하기"}
                  </Text>
                </Pressable>
              </>
            )}

            {familyError ? <Text style={styles.authErrorText}>{familyError}</Text> : null}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style={isDarkMode ? "light" : "dark"} />
      <Animated.View style={{ flex: 1, opacity: themeFadeAnim }}>
        <View style={styles.header}>
          <View style={styles.rowBetween}>
            <View>
              <View style={styles.headerTitleRow}>
                <Text style={styles.headerTitle}>패밀리톡</Text>
                <Text style={styles.headerDateText}>{todayHeaderText}</Text>
              </View>
              {familyProfile?.name ? (
                <Text style={styles.headerSubTitle}>{familyProfile.name} 가족방</Text>
              ) : null}
              {activeUserLabel ? (
                <Text style={styles.headerSubTitle}>{activeUserLabel}</Text>
              ) : null}
            </View>
            <View style={styles.headerActions}>
              {isSignedIn ? (
                <Pressable style={styles.logoutButton} onPress={handleSignOut}>
                  <Text style={styles.logoutButtonText}>로그아웃</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        {tab === "home" ? (
          <HomeScreen
            todaySchedules={todaySchedules}
            schedules={schedules}
            meal={meal}
            wishedMenus={wishedMenus}
            members={members}
            onMealStatus={updateMealStatus}
            onMealUpdate={updateMealInfo}
            onAddWishedMenu={addWishedMenu}
            onRequestDeleteSchedule={openDeleteModal}
            onRequestDeleteMeal={() => openDeleteModal(meal.id, "meal")}
            onRequestDeleteWishedMenu={(menuId) => openDeleteModal(menuId, "wishedMenu")}
            themeColors={themeColors}
          />
        ) : null}
        {tab === "schedule" ? (
          <ScheduleScreen
            schedules={schedules}
            scheduleCount={schedules.length}
            onAdd={addSchedule}
            onRequestDelete={openDeleteModal}
            themeColors={themeColors}
          />
        ) : null}
        {tab === "vote" ? (
          <VoteScreen
            votes={votes}
            onVote={voteOption}
            onCreateVote={addVote}
            onRequestDeleteVote={(voteId) => openDeleteModal(voteId, "vote")}
            themeColors={themeColors}
          />
        ) : null}
        {tab === "family" ? (
          <FamilyScreen
            members={members}
            onMood={setMemberMood}
            onAddMember={addMember}
            onRequestDeleteMember={(memberId) => openDeleteModal(memberId, "member")}
            themeColors={themeColors}
          />
        ) : null}
        {tab === "settings" ? (
          <SettingsScreen
            isDarkMode={isDarkMode}
            onToggleDarkMode={toggleDarkMode}
            canDeleteAccount={isSignedIn}
            isDeleteAccountPending={isDeleteAccountPending}
            accountActionError={accountActionError}
            onDeleteAccount={openWithdrawConfirmModal}
            canRevealFamilyCode={Boolean(settingsFamilyCode) && familyMembership?.role === "owner"}
            isFamilyCodeVisible={showSettingsFamilyCode}
            familyCode={settingsFamilyCode}
            onToggleFamilyCode={() => setShowSettingsFamilyCode((prev) => !prev)}
            themeColors={themeColors}
          />
        ) : null}

        <View style={styles.tabBar}>
          {tabs.map((item) => {
            const selected = tab === item.key;
            return (
              <Pressable key={item.key} onPress={() => setTab(item.key)} style={styles.tabButton}>
                <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Modal visible={isDeleteModalVisible} transparent animationType="none" onRequestClose={closeDeleteModal}>
          <View style={styles.modalRoot}>
            <Animated.View style={[styles.modalBackdrop, { opacity: backdropOpacity }]}>
              <Pressable style={styles.modalBackdropPressable} onPress={closeDeleteModal} />
            </Animated.View>

            <Animated.View
              style={[
                styles.deleteSheet,
                {
                  opacity: sheetAnim,
                  transform: [{ translateY: sheetTranslateY }]
                }
              ]}
            >
              <Text style={styles.deleteSheetTitle}>
                {deleteTargetType === "member"
                  ? "가족 구성원을 삭제하시겠습니까?"
                  : deleteTargetType === "vote"
                    ? "투표를 삭제하시겠습니까?"
                    : deleteTargetType === "wishedMenu"
                      ? "희망 메뉴를 삭제하시겠습니까?"
                      : "정말로 삭제하시겠습니까?"}
              </Text>
              <View style={styles.deleteSheetButtons}>
                <Pressable style={styles.deleteSheetCancelButton} onPress={closeDeleteModal}>
                  <Text style={styles.deleteSheetCancelText}>취소</Text>
                </Pressable>
                <Pressable style={styles.deleteSheetConfirmButton} onPress={confirmDeleteTarget}>
                  <Text style={styles.deleteSheetConfirmText}>네</Text>
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </Modal>

        <Modal
          visible={isWithdrawConfirmVisible}
          transparent
          animationType="none"
          onRequestClose={() => closeWithdrawConfirmModal()}
        >
          <View style={styles.modalRoot}>
            <Animated.View style={[styles.modalBackdrop, { opacity: withdrawBackdropOpacity }]}>
              <Pressable style={styles.modalBackdropPressable} onPress={() => closeWithdrawConfirmModal()} />
            </Animated.View>

            <Animated.View
              style={[
                styles.deleteSheet,
                {
                  opacity: withdrawSheetAnim,
                  transform: [{ translateY: withdrawSheetTranslateY }]
                }
              ]}
            >
              <Text style={styles.deleteSheetTitle}>탈퇴하시겠습니까?</Text>
              <View style={styles.deleteSheetButtons}>
                <Pressable style={styles.deleteSheetCancelButton} onPress={() => closeWithdrawConfirmModal()}>
                  <Text style={styles.deleteSheetCancelText}>취소</Text>
                </Pressable>
                <Pressable style={styles.deleteSheetConfirmButton} onPress={confirmWithdrawAction}>
                  <Text style={styles.deleteSheetConfirmText}>네</Text>
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </Modal>

      </Animated.View>
    </SafeAreaView>
  );
}

function createStyles(themeColors: ThemeColors) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: themeColors.background
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: themeColors.textPrimary
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8
  },
  headerDateText: {
    color: themeColors.textSecondary,
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 4
  },
  headerSubTitle: {
    marginTop: 2,
    fontSize: 13,
    color: themeColors.textSecondary
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  themeToggleButton: {
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: themeColors.card
  },
  themeToggleButtonText: {
    color: themeColors.textSecondary,
    fontSize: 12,
    fontWeight: "700"
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: themeColors.card
  },
  logoutButtonText: {
    color: themeColors.textSecondary,
    fontSize: 12,
    fontWeight: "700"
  },
  authContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: 12
  },
  brandWrap: {
    alignItems: "center",
    gap: 6
  },
  brandLogoBox: {
    width: 104,
    height: 104,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: themeColors.border,
    backgroundColor: themeColors.card,
    alignItems: "center",
    justifyContent: "center"
  },
  brandCircleBubble: {
    width: 56,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: themeColors.accent
  },
  brandCircleBubbleTail: {
    position: "absolute",
    right: 5,
    bottom: -9,
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 4,
    borderTopWidth: 22,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: themeColors.accent,
    transform: [{ rotate: "12deg" }]
  },
  brandTitle: {
    color: themeColors.textPrimary,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 1
  },
  brandSubtitle: {
    color: themeColors.textSecondary,
    fontSize: 12,
    fontWeight: "600"
  },
  authCard: {
    backgroundColor: themeColors.card,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 16,
    padding: 16,
    gap: 10
  },
  authTitle: {
    color: themeColors.textPrimary,
    fontSize: 22,
    fontWeight: "800"
  },
  authErrorText: {
    color: "#c24545",
    fontSize: 12,
    fontWeight: "600"
  },
  authActionRow: {
    flexDirection: "row",
    gap: 8
  },
  authInput: {
    paddingVertical: 12,
    maxWidth: 420,
    fontSize: 16,
    width: "100%",
    alignSelf: "center"
  },
  passwordRow: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    flexDirection: "row",
    gap: 8,
    alignItems: "center"
  },
  passwordInput: {
    flex: 1,
    maxWidth: undefined,
    width: undefined,
    alignSelf: "auto"
  },
  passwordToggleButton: {
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: themeColors.card
  },
  passwordToggleText: {
    color: themeColors.textSecondary,
    fontSize: 12,
    fontWeight: "700"
  },
  authActionButton: {
    flex: 1,
    alignItems: "center"
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 94
  },
  card: {
    backgroundColor: themeColors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: themeColors.border,
    padding: 14,
    gap: 10
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: themeColors.textPrimary
  },
  calendarOpenButton: {
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: themeColors.card
  },
  calendarOpenButtonText: {
    color: themeColors.textSecondary,
    fontSize: 12,
    fontWeight: "700"
  },
  calendarModalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20
  },
  calendarBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)"
  },
  calendarPanel: {
    maxHeight: "80%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: themeColors.border,
    backgroundColor: themeColors.card,
    padding: 14,
    gap: 10
  },
  calendarCloseButton: {
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: themeColors.card
  },
  calendarCloseButtonText: {
    color: themeColors.textSecondary,
    fontSize: 12,
    fontWeight: "700"
  },
  calendarMonthMoveButton: {
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: themeColors.card
  },
  calendarMonthTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: themeColors.textPrimary
  },
  calendarWeekHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 6
  },
  calendarWeekHeaderText: {
    width: "14.28%",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: themeColors.textSecondary
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6
  },
  calendarCell: {
    width: "14.28%",
    minHeight: 74,
    borderWidth: 1,
    borderColor: themeColors.border,
    paddingHorizontal: 4,
    paddingVertical: 4,
    backgroundColor: themeColors.card
  },
  calendarDayNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: themeColors.textPrimary
  },
  calendarHolidayName: {
    fontSize: 10,
    fontWeight: "700",
    color: "#e15252"
  },
  calendarSaturdayText: {
    color: "#2f7aff"
  },
  calendarSundayHolidayText: {
    color: "#e15252"
  },
  calendarEventText: {
    fontSize: 10,
    color: themeColors.textSecondary
  },
  calendarEventMore: {
    fontSize: 10,
    color: themeColors.accent,
    fontWeight: "700"
  },
  calendarFooter: {
    alignItems: "flex-end"
  },
  mainText: {
    fontSize: 15,
    color: themeColors.textPrimary,
    fontWeight: "600"
  },
  muted: {
    fontSize: 13,
    color: themeColors.textSecondary
  },
  subtleCount: {
    fontSize: 12,
    color: themeColors.textSecondary
  },
  scheduleItem: {
    backgroundColor: themeColors.card,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  },
  scheduleTextWrap: {
    flex: 1,
    gap: 3
  },
  scheduleTypeText: {
    fontSize: 12,
    color: themeColors.textSecondary
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: "#df5c5c",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: themeColors.card
  },
  deleteButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#c24545"
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end"
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.22)"
  },
  modalBackdropPressable: {
    flex: 1
  },
  deleteSheet: {
    backgroundColor: themeColors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: themeColors.border,
    gap: 14
  },
  deleteSheetTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: themeColors.textPrimary,
    textAlign: "center"
  },
  deleteSheetButtons: {
    flexDirection: "row",
    gap: 10
  },
  deleteSheetCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: themeColors.card
  },
  deleteSheetCancelText: {
    color: themeColors.textSecondary,
    fontSize: 14,
    fontWeight: "700"
  },
  deleteSheetConfirmButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#c24545"
  },
  deleteSheetConfirmText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700"
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  rowGap: {
    flexDirection: "row",
    gap: 8
  },
  badge: {
    fontSize: 12,
    fontWeight: "700",
    color: themeColors.accent,
    backgroundColor: themeColors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    borderWidth: 1,
    borderColor: themeColors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: themeColors.card
  },
  chipSelected: {
    borderColor: themeColors.accent,
    backgroundColor: themeColors.accentSoft
  },
  chipLabel: {
    color: themeColors.textPrimary,
    fontSize: 12,
    fontWeight: "700"
  },
  input: {
    backgroundColor: themeColors.card,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: themeColors.textPrimary
  },
  buttonPrimary: {
    backgroundColor: themeColors.accent,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10
  },
  buttonDisabled: {
    opacity: 0.5
  },
  buttonPrimaryText: {
    color: "#fff",
    fontWeight: "700"
  },
  buttonSecondary: {
    backgroundColor: themeColors.card,
    borderWidth: 1,
    borderColor: themeColors.accent,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10
  },
  buttonSecondaryText: {
    color: themeColors.accent,
    fontWeight: "700"
  },
  buttonDanger: {
    backgroundColor: "#d84a4a",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center"
  },
  buttonDangerText: {
    color: "#fff",
    fontWeight: "700"
  },
  securityCard: {
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: themeColors.card
  },
  securityTitle: {
    color: themeColors.textPrimary,
    fontSize: 14,
    fontWeight: "700"
  },
  securityCode: {
    color: themeColors.textPrimary,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 1.2
  },
  securityHint: {
    color: themeColors.textSecondary,
    fontSize: 12,
    lineHeight: 18
  },
  voteItem: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
    backgroundColor: themeColors.card,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  voteItemSelected: {
    borderColor: themeColors.success,
    backgroundColor: themeColors.accentSoft
  },
  tabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    backgroundColor: themeColors.card,
    borderTopWidth: 1,
    borderColor: themeColors.border,
    paddingVertical: 8
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 12
  },
  tabText: {
    color: themeColors.textSecondary,
    fontSize: 13,
    fontWeight: "700"
  },
  tabTextSelected: {
    color: themeColors.accent
  },
  mealItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: themeColors.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    marginTop: 12
  },
  mealItemLeft: {
    flex: 1,
    marginRight: 8
  },
  mealItemTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: themeColors.textPrimary,
    marginBottom: 2
  },
  mealItemStatus: {
    fontSize: 11,
    color: themeColors.textSecondary
  }
});
}
