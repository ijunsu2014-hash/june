import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useState } from "react";
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
import { colors, mealMeta, moodMeta } from "./src/theme";
import { DailyMeal, FamilyMember, ScheduleItem, Vote } from "./src/types";

type TabKey = "home" | "schedule" | "vote" | "family";

const tabs: { key: TabKey; label: string }[] = [
  { key: "home", label: "홈" },
  { key: "schedule", label: "일정" },
  { key: "vote", label: "투표" },
  { key: "family", label: "가족" }
];

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function AuthBrand() {
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
  meal,
  members,
  onMealStatus,
  onMealUpdate,
  onRequestDeleteSchedule
}: {
  todaySchedules: { id: string; title: string; dateTime: string; isFamilyEvent: boolean }[];
  meal: DailyMeal;
  members: FamilyMember[];
  onMealStatus: (status: DailyMeal["status"]) => void;
  onMealUpdate: (title: string, shoppingMemo?: string) => void;
  onRequestDeleteSchedule: (scheduleId: string) => void;
}) {
  const [mealTitle, setMealTitle] = useState(meal.title);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionCard title="오늘 일정">
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

      <SectionCard title="오늘의 식단">
        <Text style={styles.mainText}>{meal.title}</Text>
        <TextInput
          value={mealTitle}
          onChangeText={setMealTitle}
          placeholder="식단 제목 입력"
          placeholderTextColor={colors.textSecondary}
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

      <SectionCard title="가족 컨디션">
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
  );
}

function ScheduleScreen({
  schedules,
  scheduleCount,
  onAdd,
  onRequestDelete
}: {
  schedules: ScheduleItem[];
  scheduleCount: number;
  onAdd: (title: string, isFamily: boolean) => void;
  onRequestDelete: (scheduleId: string) => void;
}) {
  const [title, setTitle] = useState("");

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionCard title="일정 추가">
        <Text style={styles.subtleCount}>현재 일정 수 : {scheduleCount}개</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="일정 입력"
          placeholderTextColor={colors.textSecondary}
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

      <SectionCard title="등록된 일정">
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
  onCreateVote
}: {
  votes: Vote[];
  onVote: (voteId: string, optionId: string) => void;
  onCreateVote: (topic: string, options: string[]) => void;
}) {
  const [topic, setTopic] = useState("");
  const [optionsText, setOptionsText] = useState("");

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionCard title="투표 만들기">
        <TextInput
          value={topic}
          onChangeText={setTopic}
          placeholder="투표 주제 입력"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
        />
        <TextInput
          value={optionsText}
          onChangeText={setOptionsText}
          placeholder="선택지 쉼표로 구분 (예: 한식, 피자, 중식)"
          placeholderTextColor={colors.textSecondary}
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
          <SectionCard key={vote.id} title={vote.topic}>
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
          </SectionCard>
        );
      })}
    </ScrollView>
  );
}

function FamilyScreen({
  members,
  onMood,
  onAddMember
}: {
  members: FamilyMember[];
  onMood: (memberId: string, mood: FamilyMember["mood"]) => void;
  onAddMember: (name: string, role: string) => void;
}) {
  const moods = useMemo(() => Object.keys(moodMeta) as FamilyMember["mood"][], []);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionCard title="가족 구성원 추가">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="이름 입력"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
        />
        <TextInput
          value={role}
          onChangeText={setRole}
          placeholder="역할 입력 (예: 고등학생, 직장인)"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
        />
        <Pressable
          style={styles.buttonPrimary}
          onPress={() => {
            if (!name.trim() || !role.trim()) {
              return;
            }
            onAddMember(name.trim(), role.trim());
            setName("");
            setRole("");
          }}
        >
          <Text style={styles.buttonPrimaryText}>직접 가족 추가</Text>
        </Pressable>
      </SectionCard>

      {members.length === 0 ? (
        <SectionCard title="가족 구성원">
          <Text style={styles.muted}>아직 등록된 가족 구성원이 없습니다.</Text>
        </SectionCard>
      ) : (
        members.map((member) => (
          <SectionCard key={member.id} title={`${member.name} (${member.role})`}>
            <Text style={styles.muted}>온라인: {member.isOnline ? "접속 중" : "오프라인"}</Text>
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
  const [allowLocalMode, setAllowLocalMode] = useState(false);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authPending, setAuthPending] = useState(false);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [sheetAnim] = useState(() => new Animated.Value(0));
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
    addMember
  } = useFamilyTalkStore();

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

  const openDeleteModal = (scheduleId: string) => {
    setDeleteTargetId(scheduleId);
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
    });
  };

  const confirmDeleteSchedule = () => {
    if (deleteTargetId) {
      deleteSchedule(deleteTargetId);
    }
    closeDeleteModal();
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
        <StatusBar style="dark" />
        <View style={styles.authContainer}>
          <AuthBrand />
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
        <StatusBar style="dark" />
        <View style={styles.authContainer}>
          <Text style={styles.muted}>로그인 상태를 확인하는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isFirebaseConfigured && !currentUser) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="dark" />
        <View style={styles.authContainer}>
          <AuthBrand />
          <View style={styles.authCard}>
            <Text style={styles.authTitle}>패밀리톡 계정</Text>
            <Text style={styles.muted}>가족 계정으로 로그인해 계속 진행하세요.</Text>

            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="이메일"
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="비밀번호"
              secureTextEntry
              placeholderTextColor={colors.textSecondary}
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
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.headerTitle}>패밀리톡</Text>
            {isFirebaseConfigured && currentUser?.email ? (
              <Text style={styles.headerSubTitle}>{currentUser.email}</Text>
            ) : null}
          </View>
          {isFirebaseConfigured ? (
            <Pressable style={styles.logoutButton} onPress={handleSignOut}>
              <Text style={styles.logoutButtonText}>로그아웃</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {tab === "home" ? (
        <HomeScreen
          todaySchedules={todaySchedules}
          meal={meal}
          members={members}
          onMealStatus={updateMealStatus}
          onMealUpdate={updateMealInfo}
          onRequestDeleteSchedule={openDeleteModal}
        />
      ) : null}
      {tab === "schedule" ? (
        <ScheduleScreen
          schedules={schedules}
          scheduleCount={schedules.length}
          onAdd={addSchedule}
          onRequestDelete={openDeleteModal}
        />
      ) : null}
      {tab === "vote" ? <VoteScreen votes={votes} onVote={voteOption} onCreateVote={addVote} /> : null}
      {tab === "family" ? <FamilyScreen members={members} onMood={setMemberMood} onAddMember={addMember} /> : null}

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
            <Text style={styles.deleteSheetTitle}>정말로 삭제하시겠습니까?</Text>
            <View style={styles.deleteSheetButtons}>
              <Pressable style={styles.deleteSheetCancelButton} onPress={closeDeleteModal}>
                <Text style={styles.deleteSheetCancelText}>취소</Text>
              </Pressable>
              <Pressable style={styles.deleteSheetConfirmButton} onPress={confirmDeleteSchedule}>
                <Text style={styles.deleteSheetConfirmText}>네</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.textPrimary
  },
  headerSubTitle: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textSecondary
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff"
  },
  logoutButtonText: {
    color: colors.textSecondary,
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
    borderColor: colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center"
  },
  brandCircleBubble: {
    width: 56,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent
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
    borderTopColor: colors.accent,
    transform: [{ rotate: "12deg" }]
  },
  brandTitle: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 1
  },
  brandSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600"
  },
  authCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    gap: 10
  },
  authTitle: {
    color: colors.textPrimary,
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
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary
  },
  mainText: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: "600"
  },
  muted: {
    fontSize: 13,
    color: colors.textSecondary
  },
  subtleCount: {
    fontSize: 12,
    color: colors.textSecondary
  },
  scheduleItem: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.textSecondary
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: "#df5c5c",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff"
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
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: colors.border,
    gap: 14
  },
  deleteSheetTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center"
  },
  deleteSheetButtons: {
    flexDirection: "row",
    gap: 10
  },
  deleteSheetCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff"
  },
  deleteSheetCancelText: {
    color: colors.textSecondary,
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
    color: colors.accent,
    backgroundColor: colors.accentSoft,
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
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#fff"
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft
  },
  chipLabel: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700"
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10
  },
  buttonPrimaryText: {
    color: "#fff",
    fontWeight: "700"
  },
  buttonSecondary: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10
  },
  buttonSecondaryText: {
    color: colors.accent,
    fontWeight: "700"
  },
  voteItem: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  voteItemSelected: {
    borderColor: colors.success,
    backgroundColor: "#e9f8f2"
  },
  tabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700"
  },
  tabTextSelected: {
    color: colors.accent
  }
});
