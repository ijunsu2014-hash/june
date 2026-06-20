import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { useFamilyTalkStore } from "./src/hooks/useFamilyTalkStore";
import { auth, isFirebaseConfigured } from "./src/services/firebase";
import { colors, darkColors, mealMeta, moodMeta } from "./src/theme";
import { DailyMeal, FamilyMember, ScheduleItem, Vote } from "./src/types";

type TabKey = "home" | "schedule" | "vote" | "family";

const tabs: { key: TabKey; label: string }[] = [
  { key: "home", label: "홈" },
  { key: "schedule", label: "일정" },
  { key: "vote", label: "투표" },
  { key: "family", label: "가족" }
];

type ThemeColors = typeof colors;
type DeleteTargetType = "schedule" | "member" | "vote";
const THEME_STORAGE_KEY = "familytalk-theme-v1";

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
  members,
  onMealStatus,
  onMealUpdate,
  onRequestDeleteSchedule,
  themeColors
}: {
  todaySchedules: ScheduleItem[];
  schedules: ScheduleItem[];
  meal: DailyMeal;
  members: FamilyMember[];
  onMealStatus: (status: DailyMeal["status"]) => void;
  onMealUpdate: (title: string, shoppingMemo?: string) => void;
  onRequestDeleteSchedule: (scheduleId: string) => void;
  themeColors: ThemeColors;
}) {
  const [mealTitle, setMealTitle] = useState(meal.title);
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
        <Text style={styles.mainText}>{meal.title}</Text>
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
  const [allowLocalMode, setAllowLocalMode] = useState(false);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authPending, setAuthPending] = useState(false);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetType, setDeleteTargetType] = useState<DeleteTargetType>("schedule");
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [sheetAnim] = useState(() => new Animated.Value(0));
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
    votes,
    setMemberMood,
    updateMealStatus,
    updateMealInfo,
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
    if (!isFirebaseConfigured || !auth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      setAuthError("");
    });

    return unsubscribe;
  }, []);

  const runAuthAction = async (mode: "login" | "signup") => {
    if (!auth) {
      return;
    }

    if (!email.trim() || !password.trim()) {
      setAuthError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    setAuthPending(true);
    setAuthError("");

    try {
      if (mode === "signup") {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "인증 중 오류가 발생했습니다.";
      setAuthError(message);
    } finally {
      setAuthPending(false);
    }
  };

  const handleSignOut = async () => {
    if (!auth) {
      return;
    }

    try {
      await signOut(auth);
    } catch {
      setAuthError("로그아웃에 실패했습니다. 다시 시도해 주세요.");
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

  const confirmDeleteTarget = () => {
    if (deleteTargetId) {
      if (deleteTargetType === "schedule") {
        deleteSchedule(deleteTargetId);
      } else if (deleteTargetType === "vote") {
        deleteVote(deleteTargetId);
      } else {
        deleteMember(deleteTargetId);
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

  if (!isFirebaseConfigured && !allowLocalMode) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style={isDarkMode ? "light" : "dark"} />
        <View style={styles.authContainer}>
          <AuthBrand themeColors={themeColors} />
          <View style={styles.authCard}>
            <Text style={styles.authTitle}>로그인 기능은 준비 중이에요</Text>
            <Text style={styles.muted}>지금은 로컬 모드로 계속 사용할 수 있어요.</Text>
            <Pressable style={styles.buttonPrimary} onPress={() => setAllowLocalMode(true)}>
              <Text style={styles.buttonPrimaryText}>로컬 모드로 계속</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

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

  if (isFirebaseConfigured && !currentUser) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style={isDarkMode ? "light" : "dark"} />
        <View style={styles.authContainer}>
          <AuthBrand themeColors={themeColors} />
          <View style={styles.authCard}>
            <Text style={styles.authTitle}>패밀리톡 계정</Text>
            <Text style={styles.muted}>가족 계정으로 로그인해 계속 진행하세요.</Text>

            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="이메일"
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor={themeColors.textSecondary}
              style={styles.input}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="비밀번호"
              secureTextEntry
              placeholderTextColor={themeColors.textSecondary}
              style={styles.input}
            />

            {authError ? <Text style={styles.authErrorText}>{authError}</Text> : null}

            <View style={styles.authActionRow}>
              <Pressable
                style={[styles.buttonSecondary, styles.authActionButton]}
                onPress={() => runAuthAction("signup")}
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
              {isFirebaseConfigured && currentUser?.email ? (
                <Text style={styles.headerSubTitle}>{currentUser.email}</Text>
              ) : null}
            </View>
            <View style={styles.headerActions}>
              {tab === "home" ? (
                <Pressable style={styles.themeToggleButton} onPress={toggleDarkMode}>
                  <Text style={styles.themeToggleButtonText}>{isDarkMode ? "다크 모드 해제" : "다크 모드"}</Text>
                </Pressable>
              ) : null}
              {isFirebaseConfigured ? (
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
            members={members}
            onMealStatus={updateMealStatus}
            onMealUpdate={updateMealInfo}
            onRequestDeleteSchedule={openDeleteModal}
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
    paddingVertical: 8
  },
  tabText: {
    color: themeColors.textSecondary,
    fontSize: 13,
    fontWeight: "700"
  },
  tabTextSelected: {
    color: themeColors.accent
  }
});
}
