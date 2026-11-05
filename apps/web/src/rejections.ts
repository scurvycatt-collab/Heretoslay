// Player-facing text for command rejection codes. Unknown codes keep the generic message.
import type { Language } from "./i18n";

const TEXT: Record<string, { en: string; vi: string }> = {
  REQUIREMENT_NOT_MET: { en: "Requirement not met: your Party does not meet this Monster's Hero requirement.", vi: "Chưa đủ điều kiện: Party của bạn chưa đáp ứng yêu cầu Anh Hùng của Quái Vật này." },
  PARTY_FULL: { en: "Your Party is full.", vi: "Party của bạn đã đầy." },
  UNSUPPORTED_EXPANSION: { en: "That expansion is not available in this room.", vi: "Bản mở rộng này chưa có trong phòng." },
  NOT_ENOUGH_PLAYERS: { en: "The player count does not fit the selected sets.", vi: "Số người chơi không khớp với bộ đã chọn." },
  LEADER_NOT_AVAILABLE: { en: "That Leader is not available.", vi: "Thủ Lĩnh này không còn khả dụng." },
  LEADER_ACTION_UNAVAILABLE: { en: "Leader action is not available now.", vi: "Chưa dùng được kỹ năng Thủ Lĩnh lúc này." },
  HERO_ALREADY_ROLLED: { en: "This Hero already rolled this turn.", vi: "Anh Hùng này đã đổ xúc xắc trong lượt này." },
  HERO_EFFECT_BLOCKED: { en: "This Hero's effect is blocked.", vi: "Hiệu ứng của Anh Hùng này đang bị chặn." },
  INVALID_TARGET: { en: "Invalid target.", vi: "Mục tiêu không hợp lệ." },
  NOT_YOUR_TURN: { en: "It is not your turn.", vi: "Chưa đến lượt bạn." },
};

export function rejectionNotice(code: string, language: Language): string {
  const text = TEXT[code];
  return text ? `${text[language]}` : `Command rejected: ${code}. Refreshed from the server.`;
}
