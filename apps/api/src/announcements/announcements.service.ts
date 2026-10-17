import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { localDateIn } from '../menu/product-discount';
import {
  cleanAnnouncementText,
  dateOnly,
  isLiveOn,
  MAX_ACTIVE_ANNOUNCEMENTS,
  parseDateOnly,
  type AnnouncementStatus,
  type AnnouncementStyle,
} from './announcements';

export interface AnnouncementView {
  id: string;
  status: AnnouncementStatus;
  style: AnnouncementStyle;
  startsOn: string | null;
  endsOn: string | null;
  /** `{ <locale>: text }` for the languages that have one. */
  texts: Record<string, string>;
  /** Where it stands today (in the menu's timezone). */
  state: 'LIVE' | 'SCHEDULED' | 'EXPIRED' | 'OFF';
}

export interface AnnouncementInput {
  restaurantId: string;
  status?: AnnouncementStatus;
  style?: AnnouncementStyle;
  startsOn?: string | null;
  endsOn?: string | null;
  texts?: Record<string, string | null>;
}

export type AnnouncementFailure =
  | 'DEFAULT_TRANSLATION_REQUIRED'
  | 'LOCALE_NOT_ACTIVE'
  | 'ANNOUNCEMENT_DATES_INVALID'
  | 'ANNOUNCEMENT_LIMIT_REACHED'
  | 'ANNOUNCEMENT_NOT_FOUND';

export type AnnouncementResult =
  | { outcome: 'ok'; data: AnnouncementView }
  | { outcome: 'failed'; code: AnnouncementFailure };

const SELECT = {
  id: true,
  status: true,
  style: true,
  startsOn: true,
  endsOn: true,
  translations: { select: { locale: true, text: true } },
} as const;

type Row = {
  id: string;
  status: AnnouncementStatus;
  style: AnnouncementStyle;
  startsOn: Date | null;
  endsOn: Date | null;
  translations: { locale: string; text: string }[];
};

function toView(row: Row, today: string): AnnouncementView {
  const startsOn = dateOnly(row.startsOn);
  const endsOn = dateOnly(row.endsOn);
  const state: AnnouncementView['state'] =
    row.status !== 'ACTIVE'
      ? 'OFF'
      : isLiveOn({ status: row.status, startsOn, endsOn }, today)
        ? 'LIVE'
        : startsOn !== null && today < startsOn
          ? 'SCHEDULED'
          : 'EXPIRED';
  return {
    id: row.id,
    status: row.status,
    style: row.style,
    startsOn,
    endsOn,
    texts: Object.fromEntries(row.translations.map((t) => [t.locale, t.text])),
    state,
  };
}

/** Staff management of Restaurant announcements (DEC-042). Every query is scoped by the authorized Restaurant. */
@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** "Today" as the menu sees it: the date in the Restaurant's first Branch timezone. */
  private async menuToday(restaurantId: string): Promise<string> {
    const branch = await this.prisma.branch.findFirst({
      where: { restaurantId },
      orderBy: { createdAt: 'asc' },
      select: { timezone: true },
    });
    return localDateIn(branch?.timezone ?? 'UTC', new Date());
  }

  async list(restaurantId: string): Promise<AnnouncementView[]> {
    const [rows, today] = await Promise.all([
      this.prisma.restaurantAnnouncement.findMany({
        where: { restaurantId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: SELECT,
      }),
      this.menuToday(restaurantId),
    ]);
    return rows.map((row) => toView(row, today));
  }

  async create(input: AnnouncementInput): Promise<AnnouncementResult> {
    const status = input.status ?? 'ACTIVE';
    const checked = await this.validate(input, null);
    if (checked.outcome === 'failed') return checked;
    if (
      status === 'ACTIVE' &&
      (await this.activeCount(input.restaurantId, null)) >=
        MAX_ACTIVE_ANNOUNCEMENTS
    ) {
      return { outcome: 'failed', code: 'ANNOUNCEMENT_LIMIT_REACHED' };
    }

    const created = await this.prisma.restaurantAnnouncement.create({
      data: {
        restaurantId: input.restaurantId,
        status,
        style: input.style ?? 'INFO',
        startsOn: checked.startsOn,
        endsOn: checked.endsOn,
        translations: {
          create: Object.entries(checked.texts).map(([locale, text]) => ({
            locale,
            text,
          })),
        },
      },
      select: SELECT,
    });
    return {
      outcome: 'ok',
      data: toView(created, await this.menuToday(input.restaurantId)),
    };
  }

  async update(
    id: string,
    input: AnnouncementInput,
  ): Promise<AnnouncementResult> {
    const existing = await this.find(input.restaurantId, id);
    if (!existing) return { outcome: 'failed', code: 'ANNOUNCEMENT_NOT_FOUND' };

    const checked = await this.validate(input, existing);
    if (checked.outcome === 'failed') return checked;

    const status = input.status ?? existing.status;
    if (
      status === 'ACTIVE' &&
      existing.status !== 'ACTIVE' &&
      (await this.activeCount(input.restaurantId, id)) >=
        MAX_ACTIVE_ANNOUNCEMENTS
    ) {
      return { outcome: 'failed', code: 'ANNOUNCEMENT_LIMIT_REACHED' };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.restaurantAnnouncement.update({
        where: { id },
        data: {
          status,
          style: input.style ?? existing.style,
          startsOn: checked.startsOn,
          endsOn: checked.endsOn,
        },
      });
      await tx.restaurantAnnouncementTranslation.deleteMany({
        where: { announcementId: id },
      });
      await tx.restaurantAnnouncementTranslation.createMany({
        data: Object.entries(checked.texts).map(([locale, text]) => ({
          announcementId: id,
          locale,
          text,
        })),
      });
      return tx.restaurantAnnouncement.findFirstOrThrow({
        where: { id, restaurantId: input.restaurantId },
        select: SELECT,
      });
    });
    return {
      outcome: 'ok',
      data: toView(updated, await this.menuToday(input.restaurantId)),
    };
  }

  async remove(restaurantId: string, id: string): Promise<boolean> {
    const result = await this.prisma.restaurantAnnouncement.deleteMany({
      where: { id, restaurantId },
    });
    return result.count > 0;
  }

  // ------------------------------------------------------------------ helpers

  private find(restaurantId: string, id: string): Promise<Row | null> {
    return this.prisma.restaurantAnnouncement.findFirst({
      where: { id, restaurantId },
      select: SELECT,
    });
  }

  private activeCount(
    restaurantId: string,
    exceptId: string | null,
  ): Promise<number> {
    return this.prisma.restaurantAnnouncement.count({
      where: {
        restaurantId,
        status: 'ACTIVE',
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
  }

  /**
   * The merged, cleaned result of a create / update: texts (existing merged with the sent
   * ones), dates. Fails before anything is written.
   */
  private async validate(
    input: AnnouncementInput,
    existing: Row | null,
  ): Promise<
    | {
        outcome: 'ok';
        texts: Record<string, string>;
        startsOn: Date | null;
        endsOn: Date | null;
      }
    | { outcome: 'failed'; code: AnnouncementFailure }
  > {
    const [restaurant, locales] = await Promise.all([
      this.prisma.restaurant.findUniqueOrThrow({
        where: { id: input.restaurantId },
        select: { defaultLocale: true },
      }),
      this.prisma.restaurantLocale.findMany({
        where: { restaurantId: input.restaurantId, isActive: true },
        select: { locale: true },
      }),
    ]);
    const active = new Set(locales.map((row) => row.locale));

    const texts: Record<string, string> = Object.fromEntries(
      (existing?.translations ?? []).map((row) => [row.locale, row.text]),
    );
    for (const [locale, raw] of Object.entries(input.texts ?? {})) {
      if (!active.has(locale))
        return { outcome: 'failed', code: 'LOCALE_NOT_ACTIVE' };
      const text = typeof raw === 'string' ? cleanAnnouncementText(raw) : '';
      if (text === '') delete texts[locale];
      else texts[locale] = text;
    }
    if (!texts[restaurant.defaultLocale]) {
      return { outcome: 'failed', code: 'DEFAULT_TRANSLATION_REQUIRED' };
    }

    const pickDate = (
      sent: string | null | undefined,
      stored: Date | null,
    ): Date | null | 'invalid' => {
      if (sent === undefined) return stored;
      if (sent === null) return null;
      return parseDateOnly(sent) ?? 'invalid';
    };
    const startsOn = pickDate(input.startsOn, existing?.startsOn ?? null);
    const endsOn = pickDate(input.endsOn, existing?.endsOn ?? null);
    if (startsOn === 'invalid' || endsOn === 'invalid') {
      return { outcome: 'failed', code: 'ANNOUNCEMENT_DATES_INVALID' };
    }
    if (startsOn !== null && endsOn !== null && endsOn < startsOn) {
      return { outcome: 'failed', code: 'ANNOUNCEMENT_DATES_INVALID' };
    }
    return { outcome: 'ok', texts, startsOn, endsOn };
  }
}
