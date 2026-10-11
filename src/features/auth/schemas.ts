import { Type, type Static } from 'typebox';

import { emailSchema, strictObject } from '../../common/validation.js';

export const registerBodySchema = strictObject({
  name: Type.String({ minLength: 1, maxLength: 100, pattern: '\\S' }),
  email: emailSchema,
  password: Type.String({ minLength: 8, maxLength: 128 }),
});

export const registerResponseSchema = strictObject({
  userId: Type.String(),
  email: Type.String(),
  status: Type.String(),
  createdAt: Type.String({ format: 'date-time' }),
});

export type RegisterBody = Static<typeof registerBodySchema>;

export type RegisterResponse = Static<typeof registerResponseSchema>;

export const verifyEmailBodySchema = strictObject({
  email: emailSchema,
  otp: Type.String({ minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }),
});

export const verifyEmailResponseSchema = strictObject({
  success: Type.Boolean(),
  message: Type.String(),
});

export type VerifyEmailBody = Static<typeof verifyEmailBodySchema>;
export type VerifyEmailResponse = Static<typeof verifyEmailResponseSchema>;

export const resendOtpBodySchema = strictObject({
  email: emailSchema,
});

export const resendOtpResponseSchema = strictObject({
  success: Type.Boolean(),
});

export type ResendOtpBody = Static<typeof resendOtpBodySchema>;
export type ResendOtpResponse = Static<typeof resendOtpResponseSchema>;

export const loginBodySchema = strictObject({
  email: emailSchema,
  password: Type.String({ minLength: 1, maxLength: 128 }),
});

export const loginResponseSchema = strictObject({
  userId: Type.String(),
  email: Type.String(),
});

export const meResponseSchema = strictObject({
  userId: Type.String(),
  email: Type.String(),
  status: Type.String(),
  role: Type.String(),
});

export type LoginBody = Static<typeof loginBodySchema>;

export type LoginResponse = Static<typeof loginResponseSchema>;

export type MeResponse = Static<typeof meResponseSchema>;

export const requestPasswordResetBodySchema = strictObject({
  email: emailSchema,
});

export const requestPasswordResetResponseSchema = strictObject({
  success: Type.Boolean(),
});

export type RequestPasswordResetBody = Static<typeof requestPasswordResetBodySchema>;
export type RequestPasswordResetResponse = Static<typeof requestPasswordResetResponseSchema>;

export const resetPasswordBodySchema = strictObject({
  token: Type.String({ minLength: 1 }),
  newPassword: Type.String({ minLength: 8, maxLength: 128 }),
});

export const resetPasswordResponseSchema = strictObject({
  success: Type.Boolean(),
});

export type ResetPasswordBody = Static<typeof resetPasswordBodySchema>;
export type ResetPasswordResponse = Static<typeof resetPasswordResponseSchema>;

export const profileResponseSchema = strictObject({
  userId: Type.String(),
  email: Type.String(),
  name: Type.String(),
  status: Type.String(),
  createdAt: Type.String(),
});

export const updateProfileBodySchema = strictObject({
  name: Type.String({ minLength: 1, maxLength: 100 }),
});

export const changePasswordBodySchema = strictObject({
  currentPassword: Type.String({ minLength: 1, maxLength: 128 }),
  newPassword: Type.String({ minLength: 8, maxLength: 128 }),
});

export const changePasswordResponseSchema = strictObject({
  success: Type.Boolean(),
});

export const requestEmailChangeBodySchema = strictObject({
  newEmail: emailSchema,
});

export const requestEmailChangeResponseSchema = strictObject({
  success: Type.Boolean(),
});

export const verifyEmailChangeBodySchema = strictObject({
  token: Type.String({ minLength: 1, maxLength: 2048 }),
});

export type ProfileResponse = Static<typeof profileResponseSchema>;
export type UpdateProfileBody = Static<typeof updateProfileBodySchema>;
export type ChangePasswordBody = Static<typeof changePasswordBodySchema>;
export type ChangePasswordResponse = Static<typeof changePasswordResponseSchema>;
export type RequestEmailChangeBody = Static<typeof requestEmailChangeBodySchema>;
export type RequestEmailChangeResponse = Static<typeof requestEmailChangeResponseSchema>;
export type VerifyEmailChangeBody = Static<typeof verifyEmailChangeBodySchema>;
