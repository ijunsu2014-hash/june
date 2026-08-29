import * as CryptoJS from "crypto-js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
  Firestore
} from "firebase/firestore";

export type FamilyMembership = {
  familyId: string;
  role: "owner" | "member";
  displayName: string;
};

export type FamilyProfile = {
  id: string;
  name: string;
  codeCipher?: string;
};

const FAMILY_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const FAMILY_CODE_PEPPER = "familytalk-code-v1";

const randomInt = (maxExclusive: number) => {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0] % maxExclusive;
  }

  return Math.floor(Math.random() * maxExclusive);
};

const normalizeFamilyCode = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

const hashFamilyCode = (normalizedCode: string) => {
  return CryptoJS.SHA256(`${normalizedCode}|${FAMILY_CODE_PEPPER}`).toString(CryptoJS.enc.Hex);
};

// Lets the family owner re-reveal their join code later (e.g. from Settings)
// without ever storing the plaintext code server-side for other members to read.
const getOwnerCodeCipherKey = (uid: string) => `familytalk-owner-code-v1|${uid}`;

const encryptFamilyCodeForOwner = (code: string, uid: string) =>
  CryptoJS.AES.encrypt(code, getOwnerCodeCipherKey(uid)).toString();

export const decryptFamilyCodeForOwner = (cipher: string, uid: string) => {
  const bytes = CryptoJS.AES.decrypt(cipher, getOwnerCodeCipherKey(uid));
  return bytes.toString(CryptoJS.enc.Utf8);
};

export const generateFamilyCode = (length = 10) => {
  let code = "";

  for (let i = 0; i < length; i += 1) {
    const index = randomInt(FAMILY_CODE_CHARSET.length);
    code += FAMILY_CODE_CHARSET[index];
  }

  return `${code.slice(0, 5)}-${code.slice(5)}`;
};

const findFamilyIdByCode = async (db: Firestore, rawCode: string) => {
  const normalizedCode = normalizeFamilyCode(rawCode);

  if (normalizedCode.length < 8) {
    throw new Error("코드 형식이 올바르지 않습니다.");
  }

  const codeHash = hashFamilyCode(normalizedCode);
  const familyQuery = query(collection(db, "families"), where("codeHash", "==", codeHash), limit(1));
  const familyDocs = await getDocs(familyQuery);

  if (familyDocs.empty) {
    return null;
  }

  return familyDocs.docs[0].id;
};

export const getUserMembership = async (db: Firestore, uid: string): Promise<FamilyMembership | null> => {
  const membershipRef = doc(db, "familyMemberships", uid);
  const membershipSnap = await getDoc(membershipRef);

  if (!membershipSnap.exists()) {
    return null;
  }

  const data = membershipSnap.data() as FamilyMembership;
  return {
    familyId: data.familyId,
    role: data.role,
    displayName: data.displayName
  };
};

// Must run *before* deleting the Auth user: once signed out, the security
// rules no longer allow anyone to remove this membership doc, orphaning it.
export const leaveFamily = async (db: Firestore, uid: string) => {
  await deleteDoc(doc(db, "familyMemberships", uid));
};

export const getFamilyProfile = async (db: Firestore, familyId: string): Promise<FamilyProfile | null> => {
  const familyRef = doc(db, "families", familyId);
  const familySnap = await getDoc(familyRef);

  if (!familySnap.exists()) {
    return null;
  }

  const data = familySnap.data() as { name: string; codeCipher?: string };

  return {
    id: familySnap.id,
    name: data.name,
    codeCipher: data.codeCipher
  };
};

export const createFamilyAndJoin = async (
  db: Firestore,
  uid: string,
  familyName: string,
  displayName: string
): Promise<{ familyCode: string; membership: FamilyMembership; profile: FamilyProfile }> => {
  const safeFamilyName = familyName.trim();
  const safeDisplayName = displayName.trim();

  if (!safeFamilyName || !safeDisplayName) {
    throw new Error("가족 이름과 내 이름을 입력해 주세요.");
  }

  let generatedCode = "";
  let codeHash = "";
  let collisionGuard = 0;

  while (collisionGuard < 10) {
    generatedCode = generateFamilyCode();
    const normalizedCode = normalizeFamilyCode(generatedCode);
    codeHash = hashFamilyCode(normalizedCode);

    const codeQuery = query(collection(db, "families"), where("codeHash", "==", codeHash), limit(1));
    const existing = await getDocs(codeQuery);

    if (existing.empty) {
      break;
    }

    collisionGuard += 1;
  }

  if (!generatedCode || !codeHash || collisionGuard >= 10) {
    throw new Error("코드 생성에 실패했습니다. 다시 시도해 주세요.");
  }

  const familyRef = doc(collection(db, "families"));
  const membershipRef = doc(db, "familyMemberships", uid);
  const codeCipher = encryptFamilyCodeForOwner(generatedCode, uid);

  await runTransaction(db, async (tx) => {
    const existingMembership = await tx.get(membershipRef);

    if (existingMembership.exists()) {
      throw new Error("이미 참여 중인 가족 방이 있습니다.");
    }

    tx.set(familyRef, {
      name: safeFamilyName,
      codeHash,
      codeCipher,
      createdByUid: uid,
      createdAt: serverTimestamp(),
      codePolicy: "sha256-v1"
    });

    tx.set(membershipRef, {
      familyId: familyRef.id,
      role: "owner",
      displayName: safeDisplayName,
      joinedAt: serverTimestamp()
    });
  });

  return {
    familyCode: generatedCode,
    membership: {
      familyId: familyRef.id,
      role: "owner",
      displayName: safeDisplayName
    },
    profile: {
      id: familyRef.id,
      name: safeFamilyName,
      codeCipher
    }
  };
};

export const joinFamilyWithCode = async (
  db: Firestore,
  uid: string,
  rawCode: string,
  displayName: string
): Promise<{ membership: FamilyMembership; profile: FamilyProfile }> => {
  const safeDisplayName = displayName.trim();

  if (!safeDisplayName) {
    throw new Error("내 이름을 입력해 주세요.");
  }

  const familyId = await findFamilyIdByCode(db, rawCode);

  if (!familyId) {
    throw new Error("코드가 일치하지 않습니다.");
  }

  const membershipRef = doc(db, "familyMemberships", uid);
  const familyRef = doc(db, "families", familyId);

  await runTransaction(db, async (tx) => {
    const existingMembership = await tx.get(membershipRef);
    if (existingMembership.exists()) {
      throw new Error("이미 참여 중인 가족 방이 있습니다.");
    }

    const familySnap = await tx.get(familyRef);
    if (!familySnap.exists()) {
      throw new Error("가족 방을 찾을 수 없습니다.");
    }

    tx.set(membershipRef, {
      familyId,
      role: "member",
      displayName: safeDisplayName,
      joinedAt: serverTimestamp()
    });
  });

  const profile = await getFamilyProfile(db, familyId);

  if (!profile) {
    throw new Error("가족 방 정보를 불러오지 못했습니다.");
  }

  return {
    membership: {
      familyId,
      role: "member",
      displayName: safeDisplayName
    },
    profile
  };
};
