import { Firestore, doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { DailyMeal, FamilyMember, ScheduleItem, Vote, WishedMenu } from "../types";

export type FamilyAppData = {
  members: FamilyMember[];
  schedules: ScheduleItem[];
  meal: DailyMeal;
  wishedMenus: WishedMenu[];
  votes: Vote[];
};

const familyStateRef = (db: Firestore, familyId: string) => doc(db, "families", familyId, "appData", "state");

export const subscribeFamilyData = (
  db: Firestore,
  familyId: string,
  onData: (data: FamilyAppData | null) => void,
  onError: (error: unknown) => void
) => {
  return onSnapshot(
    familyStateRef(db, familyId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }

      onData(snap.data() as FamilyAppData);
    },
    onError
  );
};

export const saveFamilyData = async (db: Firestore, familyId: string, data: FamilyAppData) => {
  // Firestore rejects `undefined` field values (e.g. optional ScheduleItem.time),
  // so strip them the same way JSON.stringify already does for the AsyncStorage path.
  const sanitized = JSON.parse(JSON.stringify(data)) as FamilyAppData;
  await setDoc(familyStateRef(db, familyId), { ...sanitized, updatedAt: serverTimestamp() }, { merge: false });
};
