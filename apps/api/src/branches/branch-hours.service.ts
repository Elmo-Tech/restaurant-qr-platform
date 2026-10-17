import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  evaluateHours,
  parseSchedule,
  toDays,
  type DayHoursInput,
  type HoursMode,
  type HoursStatus,
} from './branch-hours';

export interface BranchHoursView {
  mode: HoursMode;
  temporarilyClosed: boolean;
  /** The Branch's IANA timezone: every time below is in it. */
  timezone: string;
  /** Seven entries, Sunday (0) to Saturday (6). */
  days: DayHoursInput[];
  /** What a Guest would see right now (null = always open, nothing to show). */
  status: HoursStatus | null;
}

export type UpdateBranchHoursResult =
  | { outcome: 'updated'; data: BranchHoursView }
  | { outcome: 'invalid'; code: 'INVALID_HOURS' | 'HOURS_SCHEDULE_EMPTY' };

/** Staff configuration of a Branch's opening hours (DEC-042). Branch identity and Tenant come from the guards. */
@Injectable()
export class BranchHoursService {
  constructor(private readonly prisma: PrismaService) {}

  async getHours(input: {
    restaurantId: string;
    branchId: string;
  }): Promise<BranchHoursView> {
    const branch = await this.prisma.branch.findFirstOrThrow({
      where: { id: input.branchId, restaurantId: input.restaurantId },
      select: {
        timezone: true,
        hoursMode: true,
        temporarilyClosed: true,
        openingHours: {
          select: { dayOfWeek: true, opensMinute: true, closesMinute: true },
        },
      },
    });
    const intervals = branch.openingHours;
    return {
      mode: branch.hoursMode,
      temporarilyClosed: branch.temporarilyClosed,
      timezone: branch.timezone,
      days: toDays(intervals),
      status: evaluateHours(
        {
          mode: branch.hoursMode,
          temporarilyClosed: branch.temporarilyClosed,
          intervals,
        },
        new Date(),
        branch.timezone,
      ),
    };
  }

  async updateHours(input: {
    restaurantId: string;
    branchId: string;
    mode: HoursMode;
    temporarilyClosed: boolean;
    days: DayHoursInput[] | undefined;
  }): Promise<UpdateBranchHoursResult> {
    let intervals: ReturnType<typeof parseSchedule> = [];
    if (input.mode === 'SCHEDULE') {
      intervals = parseSchedule(input.days ?? []);
      if (typeof intervals === 'string') {
        return { outcome: 'invalid', code: intervals };
      }
      if (intervals.length === 0) {
        return { outcome: 'invalid', code: 'HOURS_SCHEDULE_EMPTY' };
      }
    }
    const rows = typeof intervals === 'string' ? [] : intervals;

    await this.prisma.$transaction(async (tx) => {
      await tx.branch.update({
        where: { id: input.branchId },
        data: {
          hoursMode: input.mode,
          temporarilyClosed: input.temporarilyClosed,
        },
      });
      // Ordinary replace: the schedule is configuration, not history.
      await tx.branchOpeningHour.deleteMany({
        where: { branchId: input.branchId, restaurantId: input.restaurantId },
      });
      if (rows.length > 0) {
        await tx.branchOpeningHour.createMany({
          data: rows.map((interval) => ({
            restaurantId: input.restaurantId,
            branchId: input.branchId,
            dayOfWeek: interval.dayOfWeek,
            opensMinute: interval.opensMinute,
            closesMinute: interval.closesMinute,
          })),
        });
      }
    });

    return {
      outcome: 'updated',
      data: await this.getHours({
        restaurantId: input.restaurantId,
        branchId: input.branchId,
      }),
    };
  }
}
