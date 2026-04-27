"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type Locale = "en" | "vi";

const LS_LANG = "lang";
const LS_LOCALE_LEGACY = "locale";

/**
 * Resolves initial locale. Call only on the client (e.g. inside `useEffect`).
 * Priority: `localStorage.lang` → legacy `localStorage.locale` (migrated to `lang`) → `navigator` → `vi`.
 */
export function getInitialLang(): Locale {
  if (typeof window === "undefined") return "vi";
  const stored = localStorage.getItem(LS_LANG);
  if (stored === "vi" || stored === "en") {
    return stored;
  }
  const legacy = localStorage.getItem(LS_LOCALE_LEGACY) as Locale | null;
  if (legacy === "vi" || legacy === "en") {
    localStorage.setItem(LS_LANG, legacy);
    return legacy;
  }
  const browser = navigator.language || "";
  if (browser.startsWith("vi")) return "vi";
  return "vi";
}

const translations = {
  en: {
    sessionsToday: "Sessions Today",
    sessionsTomorrow: "Sessions Tomorrow",
    pickleball: "Pickleball",
    hoChiMinhCity: "Ho Chi Minh City",
    sessions: "sessions",
    players: "players",
    updatedAt: "Updated at",
    on: "on",
    noSessionsLoadedYet: "no sessions loaded for this date yet",
    tomorrowEmpty: "Tomorrow's list is empty in our database",
    tomorrowEmptyDesc: "Sessions are stored per calendar day on the server. After each Reclub sync (about 6 AM and 1 PM HCMC), the next day's rows appear here. If production has not ingested tomorrow yet, you will see zero until that run completes — check",
    forLiveBookings: "for live bookings in the meantime.",
    freeTonight: "Free Tonight",
    freeTomorrowNight: "Free Tomorrow Night",
    freeSessionsFrom6pm: "Free sessions from 6:00 PM with spots left — nearest first",
    freeSessionsTomorrow6pm: "Free sessions tomorrow from 6:00 PM with spots left — nearest first",
    freeFrom6pm: "Free · From 6pm",
    left: "left",
    away: "away",
    introBannerTitle: "Find the best pickleball sessions in HCM",
    introBannerBody:
      "Ranked by price/hr, fill rate and community — not just listed. Free sessions highlighted daily.",
    introBannerCta: "Got it →",
    getFreeSessions: "Get free sessions daily",
    joinZaloGroup: "Join our Zalo group",
    list: "List",
    map: "Map",
    today: "Today",
    tomorrow: "Tomorrow",
    fromNow: "From Now",
    past: "Past",
    showMore: "Show more",
    remaining: "remaining",
    sessionDetails: "Session details",
    close: "Close",
    noSessionsFound: "No sessions found",
    tryAnotherDay: "Try another day or check back after the next data update.",
    noSessionsMatch: "No sessions match your filters",
    tryAdjusting: "Try adjusting your filters or clear search.",
    noSessionsToShow: "No sessions to show yet",
    tomorrowListingsAppear: "Tomorrow's listings appear here after each sync from Reclub. See the note above for timing, or open Reclub to browse what's already published.",
    zaloFloatingCta: "🟢 Buổi FREE mỗi ngày — Tham gia Zalo",
    copiedToast: "Đã sao chép — Dán vào Zalo ✓",
    shareThisSession: "Share with friends",
    continueToReclub: "Continue to Reclub →",
    shareClipboardToast: "Copied to clipboard ✓",
    bookOnReclubCta: "Book on Reclub →",
    backToAllSessions: "← All sessions",
    backToHome: "Back to home",
    sessionDetailNotFoundTitle: "Session not found",
    sessionDetailNotFoundBody: "This link may be outdated or the session is no longer in our listings.",
    minutesShort: "min",
    expandFreeTonight: "Expand Free Tonight section",
    collapseFreeTonight: "Collapse Free Tonight section",
    // Filters
    free: "Free",
    filling: "Filling",
    cheapest: "Cheapest",
    nearby: "Nearby",
    filters: "Filters",
    searchPlaceholder: "Sessions, clubs, addresses…",
    search: "Search",
    done: "Done",
    sessionsFound: "sessions found",
    sessionFound: "session found",
    time: "Time",
    allDay: "All day",
    morning: "Morning (<12h)",
    afternoon: "Afternoon (12-17h)",
    evening: "Evening (>17h)",
    maxPrice: "Max Price",
    anyPrice: "Any price",
    freeOnly: "Free only",
    under: "Under",
    sessionType: "Session Type",
    allTypes: "All types",
    social: "Social",
    drillsClinic: "Drills / Clinic",
    roundRobin: "Round Robin",
    availability: "Availability",
    any: "Any",
    available: "Available",
    fillingUp: "Filling up",
    full: "Full",
    sort: "Sort",
    startTime: "Start time",
    nearestFirst: "Nearest first",
    priceLowFirst: "Price (low first)",
    costPerHour: "Cost/hour",
    fillRate: "Fill rate",
    fillRateLabelAvailable: "Available",
    fillRateLabelFilling: "Filling",
    fillRateLabelFull: "Full",
    bestScore: "Best score",
    scoreTitle: "Score",
    scoreFill: "Fill rate",
    scoreValue: "Value",
    scoreCommunity: "Community",
    scoreVibe: "Vibe",
    scoreSoon: "Soon",
    scoreBreakFillLabel: "Fill rate",
    scoreBreakFillSubtitle: "How full this session is",
    scoreBreakPriceLabel: "Price / hr",
    scoreBreakPriceSubtitle: "Cost per hour vs HCM average",
    scoreBreakOrganisedLabel: "Organised",
    scoreBreakOrganisedSubtitle: "Has an active Zalo group",
    scoreBreakRegularsLabel: "Regulars",
    scoreBreakRegularsSubtitle: "Player retention — coming soon",
    scorePlayerLevels: "Player levels",
    scoreDuprRosterSubtitle: "Based on session roster",
    scoreDuprLineLoading: "DUPR · Loading...",
    scoreDuprTierCasual: "Casual",
    scoreDuprTierMixed: "Mixed",
    scoreDuprTierCompetitive: "Competitive",
    scoreHowCalculated: "How this score is calculated",
    scoreRatingExcellent: "Excellent",
    scoreRatingGood: "Good",
    scoreRatingAverage: "Average",
    scoreRatingBelowAvg: "Below avg",
    clubAvgScore: "Avg score",
    mostAvailable: "Most available",
    foodDrink: "Food & Drink",
    hasFoodDrink: "Has food/drink",
    minimumTwoPlayers: "Minimum 2 players:",
    from: "From",
    session: "session",
    // Clubs
    clubDirectory: "Club Directory",
    clubsIn: "pickleball clubs in Ho Chi Minh City",
    searchClubs: "Search clubs...",
    mostMembers: "Most members",
    mostSessions: "Most sessions",
    mostPlayers: "Most players",
    highestFillRate: "Highest fill rate",
    lowestPrice: "Lowest price",
    grid: "Grid",
    noClubsFound: "No clubs found",
    tryAdjustingSearch: "Try adjusting your search.",
    // Navbar
    navSessions: "Sessions",
    navClubs: "Clubs",
    navOrganizer: "Organizer",
    navVenue: "Venue",
    // Footer
    footer: "HCM Pickleball Hub — Data from Reclub.co — Updated daily",
  },
  vi: {
    sessionsToday: "Buổi chơi hôm nay",
    sessionsTomorrow: "Buổi chơi ngày mai",
    pickleball: "Pickleball",
    hoChiMinhCity: "TP. Hồ Chí Minh",
    sessions: "buổi chơi",
    players: "người chơi",
    updatedAt: "Cập nhật lúc",
    on: "ngày",
    noSessionsLoadedYet: "chưa có dữ liệu cho ngày này",
    tomorrowEmpty: "Danh sách ngày mai đang trống trong hệ thống",
    tomorrowEmptyDesc: "Dữ liệu được lưu theo ngày trên máy chủ. Sau mỗi lần đồng bộ Reclub (khoảng 6 giờ sáng và 1 giờ chiều giờ HCMC), buổi chơi ngày mai sẽ xuất hiện ở đây. Nếu chưa có, vui lòng chờ hoặc kiểm tra",
    forLiveBookings: "để xem lịch đặt trực tiếp.",
    freeTonight: "Miễn phí tối nay",
    freeTomorrowNight: "Miễn phí tối mai",
    freeSessionsFrom6pm: "Buổi chơi miễn phí từ 18:00, còn chỗ — gần nhất trước",
    freeSessionsTomorrow6pm: "Buổi chơi miễn phí ngày mai từ 18:00, còn chỗ — gần nhất trước",
    freeFrom6pm: "Miễn phí · Từ 18h",
    left: "còn",
    away: "cách",
    introBannerTitle: "Tìm buổi pickleball tốt nhất ở HCM",
    introBannerBody:
      "Xếp hạng theo giá/giờ, tỷ lệ lấp đầy và cộng đồng — không chỉ liệt kê. Buổi FREE được cập nhật mỗi ngày.",
    introBannerCta: "Đã hiểu →",
    getFreeSessions: "Nhận buổi chơi miễn phí mỗi ngày",
    joinZaloGroup: "Tham gia nhóm Zalo",
    list: "Danh sách",
    map: "Bản đồ",
    today: "Hôm nay",
    tomorrow: "Ngày mai",
    fromNow: "Từ bây giờ",
    past: "Đã qua",
    showMore: "Xem thêm",
    remaining: "còn lại",
    sessionDetails: "Chi tiết buổi chơi",
    close: "Đóng",
    noSessionsFound: "Không tìm thấy buổi chơi",
    tryAnotherDay: "Thử ngày khác hoặc quay lại sau khi cập nhật dữ liệu.",
    noSessionsMatch: "Không có buổi chơi phù hợp",
    tryAdjusting: "Thử thay đổi bộ lọc hoặc xóa tìm kiếm.",
    noSessionsToShow: "Chưa có buổi chơi để hiển thị",
    tomorrowListingsAppear: "Danh sách ngày mai sẽ xuất hiện sau mỗi lần đồng bộ từ Reclub. Xem ghi chú phía trên về thời gian, hoặc mở Reclub để xem.",
    zaloFloatingCta: "🟢 Buổi FREE mỗi ngày — Tham gia Zalo",
    copiedToast: "Đã sao chép — Dán vào Zalo ✓",
    shareThisSession: "Chia sẻ với bạn bè",
    continueToReclub: "Tiếp tục đến Reclub →",
    shareClipboardToast: "Đã sao chép vào clipboard ✓",
    bookOnReclubCta: "Đặt trên Reclub →",
    backToAllSessions: "← Tất cả buổi chơi",
    backToHome: "Về trang chủ",
    sessionDetailNotFoundTitle: "Không tìm thấy buổi chơi",
    sessionDetailNotFoundBody: "Liên kết có thể đã cũ hoặc buổi chơi không còn trong danh sách.",
    minutesShort: "phút",
    expandFreeTonight: "Mở rộng mục Miễn phí tối nay",
    collapseFreeTonight: "Thu gọn mục Miễn phí tối nay",
    // Filters
    free: "Miễn phí",
    filling: "Sắp đầy",
    cheapest: "Rẻ nhất",
    nearby: "Gần đây",
    filters: "Bộ lọc",
    searchPlaceholder: "Buổi chơi, CLB, địa chỉ…",
    search: "Tìm kiếm",
    done: "Xong",
    sessionsFound: "buổi chơi tìm thấy",
    sessionFound: "buổi chơi tìm thấy",
    time: "Thời gian",
    allDay: "Cả ngày",
    morning: "Sáng (<12h)",
    afternoon: "Chiều (12-17h)",
    evening: "Tối (>17h)",
    maxPrice: "Giá tối đa",
    anyPrice: "Bất kỳ",
    freeOnly: "Chỉ miễn phí",
    under: "Dưới",
    sessionType: "Loại buổi chơi",
    allTypes: "Tất cả",
    social: "Giao lưu",
    drillsClinic: "Tập luyện",
    roundRobin: "Round Robin",
    availability: "Tình trạng",
    any: "Bất kỳ",
    available: "Còn chỗ",
    fillingUp: "Sắp đầy",
    full: "Hết chỗ",
    sort: "Sắp xếp",
    startTime: "Giờ bắt đầu",
    nearestFirst: "Gần nhất",
    priceLowFirst: "Giá (thấp nhất)",
    costPerHour: "Giá/giờ",
    fillRate: "Tỷ lệ đầy",
    fillRateLabelAvailable: "Còn chỗ",
    fillRateLabelFilling: "Sắp đầy",
    fillRateLabelFull: "Hết chỗ",
    bestScore: "Điểm tốt nhất",
    scoreTitle: "Điểm",
    scoreFill: "Lấp đầy",
    scoreValue: "Giá trị",
    scoreCommunity: "Cộng đồng",
    scoreVibe: "Không khí",
    scoreSoon: "Sắp có",
    scoreBreakFillLabel: "Tỷ lệ lấp đầy",
    scoreBreakFillSubtitle: "Buổi chơi đầy đến đâu",
    scoreBreakPriceLabel: "Giá / giờ",
    scoreBreakPriceSubtitle: "Chi phí mỗi giờ so với trung bình HCM",
    scoreBreakOrganisedLabel: "Tổ chức",
    scoreBreakOrganisedSubtitle: "Có nhóm Zalo hoạt động",
    scoreBreakRegularsLabel: "Khách quen",
    scoreBreakRegularsSubtitle: "Dữ liệu giữ chân người chơi — sắp có",
    scorePlayerLevels: "Trình độ người chơi",
    scoreDuprRosterSubtitle: "Theo danh sách buổi chơi",
    scoreDuprLineLoading: "DUPR · Đang tải...",
    scoreDuprTierCasual: "Chơi xã giao",
    scoreDuprTierMixed: "Hỗn hợp",
    scoreDuprTierCompetitive: "Cạnh tranh",
    scoreHowCalculated: "Cách tính điểm này",
    scoreRatingExcellent: "Xuất sắc",
    scoreRatingGood: "Tốt",
    scoreRatingAverage: "Trung bình",
    scoreRatingBelowAvg: "Dưới trung bình",
    clubAvgScore: "Điểm TB",
    mostAvailable: "Còn nhiều chỗ nhất",
    foodDrink: "Đồ ăn & Uống",
    hasFoodDrink: "Có đồ ăn/uống",
    minimumTwoPlayers: "Tối thiểu 2 người chơi:",
    from: "Từ",
    session: "buổi chơi",
    // Clubs
    clubDirectory: "Danh sách câu lạc bộ",
    clubsIn: "câu lạc bộ pickleball tại TP. HCM",
    searchClubs: "Tìm câu lạc bộ...",
    mostMembers: "Nhiều thành viên nhất",
    mostSessions: "Nhiều buổi chơi nhất",
    mostPlayers: "Nhiều người chơi nhất",
    highestFillRate: "Tỷ lệ đầy cao nhất",
    lowestPrice: "Giá thấp nhất",
    grid: "Lưới",
    noClubsFound: "Không tìm thấy CLB",
    tryAdjustingSearch: "Thử thay đổi từ khóa tìm kiếm.",
    // Navbar
    navSessions: "Buổi chơi",
    navClubs: "CLB",
    navOrganizer: "Tổ chức",
    navVenue: "Sân",
    // Footer
    footer: "HCM Pickleball Hub — Dữ liệu từ Reclub.co — Cập nhật hàng ngày",
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

type I18nContextType = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey) => string;
};

const I18nContext = createContext<I18nContextType>({
  locale: "vi",
  setLocale: () => {},
  t: (key) => translations.vi[key],
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("vi");

  useEffect(() => {
    setLocaleState(getInitialLang());
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_LANG, l);
      localStorage.removeItem(LS_LOCALE_LEGACY);
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey) => translations[locale][key] ?? translations.en[key] ?? key,
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
