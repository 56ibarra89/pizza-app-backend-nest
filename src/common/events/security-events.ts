export const SECURITY_SOCKETS_REVALIDATE_EVENT = 'security.sockets.revalidate';

export interface SecuritySocketsRevalidateEvent {
  userId?: string;
  accessRoleId?: string;
  kitchenId?: string;
}
