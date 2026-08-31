import { Module } from '@nestjs/common';
import { AuthModule } from '../../src/auth/auth.module';
import { ProtectedTestController } from './protected-test.controller';

/**
 * TEST-ONLY module wiring `ProtectedTestController` in for e2e coverage of
 * AuthGuard. Imported only by `auth-guard-http.e2e-spec.ts`'s Nest testing
 * module alongside the real `AppModule` -- never part of the production
 * application.
 */
@Module({
  imports: [AuthModule],
  controllers: [ProtectedTestController],
})
export class ProtectedTestModule {}
