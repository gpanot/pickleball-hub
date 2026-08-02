/**
 * Server-side push notification copy in all supported languages.
 * Mirrors the mobile `push` namespace JSON files.
 *
 * Usage:
 *   const lang = await getPlayerPushLang(profileId)
 *   const copy = pushCopy[lang].bookingConfirmed(sessionName)
 */

export type PushLang = "en" | "vi" | "ms" | "fr";

const SUPPORTED_LANGS: PushLang[] = ["en", "vi", "ms", "fr"];

export function resolvelang(raw: unknown): PushLang {
  if (typeof raw === "string" && SUPPORTED_LANGS.includes(raw as PushLang)) {
    return raw as PushLang;
  }
  return "en";
}

type PushStrings = {
  bookingConfirmed: (sessionName: string) => { title: string; body: string };
  bookingRequested: (playerName: string, sessionName: string) => { title: string; body: string };
  bookingWaitingList: (sessionName: string) => { title: string; body: string };
  bookingDeclined: (sessionName: string) => { title: string; body: string };
  autoBackfill: (sessionName: string) => { title: string; body: string };
  sessionCancelled: (sessionName: string) => { title: string; body: string };
  playerCancelled: (playerName: string, sessionName: string) => { title: string; body: string };
  managerAdded: (clubName: string, role: string) => { title: string; body: string };
  managerRemoved: (clubName: string) => { title: string; body: string };
  sessionsReassigned: (nickname: string, count: number) => { title: string; body: string };
  ownershipTransferredToYou: (clubName: string) => { title: string; body: string };
  ownershipTransferredAway: (clubName: string) => { title: string; body: string };
};

export const pushCopy: Record<PushLang, PushStrings> = {
  en: {
    bookingConfirmed: (s) => ({ title: "You're in! 🎾", body: `You're confirmed for ${s}` }),
    bookingRequested: (p, s) => ({ title: "New booking request", body: `${p} requested to join ${s}` }),
    bookingWaitingList: (s) => ({ title: "You're on the waiting list", body: `You're on the waiting list for ${s}` }),
    bookingDeclined: (s) => ({ title: "Request not approved", body: `Your request for ${s} wasn't approved` }),
    autoBackfill: (s) => ({ title: "A spot opened up! 🎉", body: `A spot opened up — you're confirmed for ${s}` }),
    sessionCancelled: (s) => ({ title: "Session cancelled", body: `${s} has been cancelled by the host` }),
    playerCancelled: (p, s) => ({ title: "Spot freed up", body: `${p} cancelled their spot for ${s}` }),
    managerAdded: (club, role) => ({ title: "New role in club", body: `You are now a ${role} for ${club}` }),
    managerRemoved: (club) => ({ title: "Role removed", body: `You are no longer a manager for ${club}` }),
    sessionsReassigned: (nick, n) => ({ title: "Sessions moved to you", body: `${nick} was removed. You now own ${n} of their upcoming sessions.` }),
    ownershipTransferredToYou: (club) => ({ title: "You are now the Owner", body: `You are now the Owner of ${club}` }),
    ownershipTransferredAway: (club) => ({ title: "Ownership transferred", body: `You are now an Admin of ${club}` }),
  },
  vi: {
    bookingConfirmed: (s) => ({ title: "Bạn đã vào! 🎾", body: `Bạn đã được xác nhận cho ${s}` }),
    bookingRequested: (p, s) => ({ title: "Yêu cầu đặt chỗ mới", body: `${p} muốn tham gia ${s}` }),
    bookingWaitingList: (s) => ({ title: "Bạn đang trong danh sách chờ", body: `Bạn đang trong danh sách chờ cho ${s}` }),
    bookingDeclined: (s) => ({ title: "Yêu cầu không được chấp nhận", body: `Yêu cầu của bạn cho ${s} không được chấp nhận` }),
    autoBackfill: (s) => ({ title: "Có chỗ trống! 🎉", body: `Có chỗ trống — bạn đã được xác nhận cho ${s}` }),
    sessionCancelled: (s) => ({ title: "Buổi chơi đã bị hủy", body: `${s} đã bị hủy` }),
    playerCancelled: (p, s) => ({ title: "Có chỗ trống", body: `${p} đã hủy chỗ trong ${s}` }),
    managerAdded: (club, role) => ({ title: "Vai trò mới trong câu lạc bộ", body: `Bạn đã trở thành ${role} của ${club}` }),
    managerRemoved: (club) => ({ title: "Vai trò đã bị xóa", body: `Bạn không còn là quản lý của ${club}` }),
    sessionsReassigned: (nick, n) => ({ title: "Buổi chơi được chuyển cho bạn", body: `${nick} đã bị xóa. Bạn sở hữu ${n} buổi chơi sắp tới của họ.` }),
    ownershipTransferredToYou: (club) => ({ title: "Bạn là Chủ sở hữu mới", body: `Bạn là Chủ sở hữu của ${club}` }),
    ownershipTransferredAway: (club) => ({ title: "Chuyển quyền sở hữu", body: `Bạn đã trở thành Admin của ${club}` }),
  },
  ms: {
    bookingConfirmed: (s) => ({ title: "Anda dah masuk! 🎾", body: `Anda disahkan untuk ${s}` }),
    bookingRequested: (p, s) => ({ title: "Permintaan tempahan baru", body: `${p} meminta untuk menyertai ${s}` }),
    bookingWaitingList: (s) => ({ title: "Anda dalam senarai tunggu", body: `Anda dalam senarai tunggu untuk ${s}` }),
    bookingDeclined: (s) => ({ title: "Permintaan tidak diluluskan", body: `Permintaan anda untuk ${s} tidak diluluskan` }),
    autoBackfill: (s) => ({ title: "Ada tempat kosong! 🎉", body: `Ada tempat kosong — anda disahkan untuk ${s}` }),
    sessionCancelled: (s) => ({ title: "Sesi dibatalkan", body: `${s} telah dibatalkan` }),
    playerCancelled: (p, s) => ({ title: "Tempat dikosongkan", body: `${p} membatalkan tempat dalam ${s}` }),
    managerAdded: (club, role) => ({ title: "Peranan baru dalam kelab", body: `Anda kini ${role} untuk ${club}` }),
    managerRemoved: (club) => ({ title: "Peranan dibuang", body: `Anda bukan lagi pengurus untuk ${club}` }),
    sessionsReassigned: (nick, n) => ({ title: "Sesi dipindahkan kepada anda", body: `${nick} dibuang. Anda kini memiliki ${n} sesi akan datang mereka.` }),
    ownershipTransferredToYou: (club) => ({ title: "Anda kini Pemilik", body: `Anda kini Pemilik ${club}` }),
    ownershipTransferredAway: (club) => ({ title: "Pemilikan dipindahkan", body: `Anda kini Admin ${club}` }),
  },
  fr: {
    bookingConfirmed: (s) => ({ title: "Vous êtes dans la session ! 🎾", body: `Vous êtes confirmé pour ${s}` }),
    bookingRequested: (p, s) => ({ title: "Nouvelle demande de réservation", body: `${p} a demandé à rejoindre ${s}` }),
    bookingWaitingList: (s) => ({ title: "Vous êtes sur liste d'attente", body: `Vous êtes sur liste d'attente pour ${s}` }),
    bookingDeclined: (s) => ({ title: "Demande non approuvée", body: `Votre demande pour ${s} n'a pas été approuvée` }),
    autoBackfill: (s) => ({ title: "Une place s'est libérée ! 🎉", body: `Une place s'est libérée — vous êtes confirmé pour ${s}` }),
    sessionCancelled: (s) => ({ title: "Session annulée", body: `${s} a été annulée` }),
    playerCancelled: (p, s) => ({ title: "Place libérée", body: `${p} a annulé sa place dans ${s}` }),
    managerAdded: (club, role) => ({ title: "Nouveau rôle dans le club", body: `Vous êtes maintenant ${role} pour ${club}` }),
    managerRemoved: (club) => ({ title: "Rôle supprimé", body: `Vous n'êtes plus manager de ${club}` }),
    sessionsReassigned: (nick, n) => ({ title: "Sessions transférées", body: `${nick} a été retiré. Vous gérez maintenant ${n} de leurs sessions à venir.` }),
    ownershipTransferredToYou: (club) => ({ title: "Vous êtes maintenant Propriétaire", body: `Vous êtes le Propriétaire de ${club}` }),
    ownershipTransferredAway: (club) => ({ title: "Propriété transférée", body: `Vous êtes maintenant Admin de ${club}` }),
  },
};

/**
 * Resolve a player's preferred push language from their `preferences` JSON.
 * Defaults to "en" if unset or invalid.
 */
export function getLangFromPrefs(preferences: unknown): PushLang {
  if (preferences && typeof preferences === "object") {
    const prefs = preferences as Record<string, unknown>;
    return resolvelang(prefs["language"]);
  }
  return "en";
}
