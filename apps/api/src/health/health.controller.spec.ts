import { HttpException, HttpStatus } from '@nestjs/common';
import { HealthController } from './health.controller';

function build(queryRaw: jest.Mock) {
  return new HealthController({ $queryRaw: queryRaw } as never);
}

describe('HealthController', () => {
  it('health reports the process is alive, and nothing else', () => {
    const controller = build(jest.fn());

    expect(controller.health()).toEqual({ status: 'ok' });
  });

  it('health never touches the database', () => {
    const queryRaw = jest.fn();

    build(queryRaw).health();

    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('ready succeeds when PostgreSQL answers', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);

    await expect(build(queryRaw).ready()).resolves.toEqual({ status: 'ready' });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('ready is a bare 503 when PostgreSQL is unreachable -- no cause, URL or detail leaks', async () => {
    const queryRaw = jest
      .fn()
      .mockRejectedValue(new Error('connect ECONNREFUSED postgresql://user:secret@db:5432/app'));

    const failure = await build(queryRaw)
      .ready()
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(HttpException);
    const exception = failure as HttpException;
    expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(exception.getResponse()).toEqual({ status: 'unavailable' });
    expect(JSON.stringify(exception.getResponse())).not.toMatch(/secret|postgres|ECONNREFUSED/);
  });

  it('ready treats a hung database as not ready (times out instead of hanging the probe)', async () => {
    jest.useFakeTimers();
    try {
      const queryRaw = jest.fn().mockReturnValue(new Promise(() => undefined));
      const pending = build(queryRaw)
        .ready()
        .then(
          () => null,
          (error: unknown) => error,
        );

      await jest.advanceTimersByTimeAsync(2500);

      const failure = (await pending) as HttpException;
      expect(failure.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    } finally {
      jest.useRealTimers();
    }
  });
});
