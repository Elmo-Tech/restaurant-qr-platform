import { MeController } from './me.controller';
import type { AuthContext } from '../context/auth-context.service';
import type { AuthenticatedRequest } from '../guard/authenticated-request';

const CONTEXT: AuthContext = {
  user: { id: 'user-1', email: 'owner@example.com', preferredLocale: 'ar' },
  memberships: [],
};

function buildRequest(userId: string): AuthenticatedRequest {
  return {
    auth: {
      sessionId: 'session-1',
      userId,
      expiresAt: new Date(),
      lastSeenAt: new Date(),
      userState: 'ACTIVE',
    },
  } as unknown as AuthenticatedRequest;
}

describe('MeController', () => {
  let authContextService: { getAuthContext: jest.Mock };
  let controller: MeController;

  beforeEach(() => {
    authContextService = {
      getAuthContext: jest.fn().mockResolvedValue(CONTEXT),
    };
    controller = new MeController(authContextService as never);
  });

  it('reads userId only from request.auth, never from another source', async () => {
    const request = buildRequest('user-1');

    await controller.getMe(request);

    expect(authContextService.getAuthContext).toHaveBeenCalledWith('user-1');
    expect(authContextService.getAuthContext).toHaveBeenCalledTimes(1);
  });

  it('wraps the AuthContextService result in the documented { data } envelope', async () => {
    const request = buildRequest('user-1');

    const body = await controller.getMe(request);

    expect(body).toEqual({ data: CONTEXT });
  });

  it("getMe's only parameter is the authenticated request (no @Res(), no raw cookie handling)", () => {
    expect(controller.getMe.length).toBe(1);
  });
});
