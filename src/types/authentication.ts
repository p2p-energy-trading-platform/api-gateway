export interface AuthenticatedPrincipal {
  userId: string;
  role: string | undefined;
  scopes: string[];
}
