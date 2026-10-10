import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

import {
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
  resendOtpHandler,
  verifyEmailHandler,
  requestPasswordResetHandler,
  resetPasswordHandler,
  getProfileHandler,
  updateProfileHandler,
  changePasswordHandler,
  requestEmailChangeHandler,
  verifyEmailChangeHandler,
} from './handler.js';
import {
  loginBodySchema,
  loginResponseSchema,
  meResponseSchema,
  registerBodySchema,
  registerResponseSchema,
  resendOtpBodySchema,
  resendOtpResponseSchema,
  verifyEmailBodySchema,
  verifyEmailResponseSchema,
  requestPasswordResetBodySchema,
  requestPasswordResetResponseSchema,
  resetPasswordBodySchema,
  resetPasswordResponseSchema,
  profileResponseSchema,
  updateProfileBodySchema,
  changePasswordBodySchema,
  changePasswordResponseSchema,
  requestEmailChangeBodySchema,
  requestEmailChangeResponseSchema,
  verifyEmailChangeBodySchema,
} from './schemas.js';

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const router = app.withTypeProvider<TypeBoxTypeProvider>();

  router.post(
    '/api/v1/auth/register',
    {
      config: {
        rateLimit: 'auth-register',
        auth: 'public',
      },
      schema: {
        body: registerBodySchema,
        response: {
          201: registerResponseSchema,
        },
      },
    },
    registerHandler,
  );

  router.post(
    '/api/v1/auth/verify-email',
    {
      config: { rateLimit: 'auth-email-verification', auth: 'public' },
      schema: {
        body: verifyEmailBodySchema,
        response: { 200: verifyEmailResponseSchema },
      },
    },
    verifyEmailHandler,
  );

  router.post(
    '/api/v1/auth/resend-otp',
    {
      config: { rateLimit: 'auth-resend-otp', auth: 'public' },
      schema: {
        body: resendOtpBodySchema,
        response: { 200: resendOtpResponseSchema },
      },
    },
    resendOtpHandler,
  );

  router.post(
    '/api/v1/auth/login',
    {
      config: { rateLimit: 'auth-login', auth: 'public' },
      schema: {
        body: loginBodySchema,
        response: { 200: loginResponseSchema },
      },
    },
    loginHandler,
  );

  router.post(
    '/api/v1/auth/password-reset',
    {
      config: { rateLimit: 'auth-password-reset', auth: 'public' },
      schema: {
        body: requestPasswordResetBodySchema,
        response: { 200: requestPasswordResetResponseSchema },
      },
    },
    requestPasswordResetHandler,
  );

  router.post(
    '/api/v1/auth/password-reset/confirm',
    {
      config: { rateLimit: 'auth-password-reset', auth: 'public' },
      schema: {
        body: resetPasswordBodySchema,
        response: { 200: resetPasswordResponseSchema },
      },
    },
    resetPasswordHandler,
  );

  router.post(
    '/api/v1/auth/refresh',
    {
      config: { rateLimit: 'auth-refresh', auth: 'public' },
    },
    refreshHandler,
  );

  router.post(
    '/api/v1/auth/logout',
    {
      config: { rateLimit: 'auth-logout', auth: 'public' },
    },
    logoutHandler,
  );

  router.get(
    '/api/v1/auth/me',
    {
      config: { rateLimit: 'authenticated-read', auth: 'required' },
      schema: { response: { 200: meResponseSchema } },
    },
    meHandler,
  );

  router.get(
    '/api/v1/auth/profile',
    {
      config: { rateLimit: 'authenticated-read', auth: 'required' },
      schema: { response: { 200: profileResponseSchema } },
    },
    getProfileHandler,
  );

  router.patch(
    '/api/v1/auth/profile',
    {
      config: { rateLimit: 'authenticated-write', auth: 'required' },
      schema: {
        body: updateProfileBodySchema,
        response: { 200: profileResponseSchema },
      },
    },
    updateProfileHandler,
  );

  router.post(
    '/api/v1/auth/change-password',
    {
      config: { rateLimit: 'authenticated-write', auth: 'required' },
      schema: {
        body: changePasswordBodySchema,
        response: { 200: changePasswordResponseSchema },
      },
    },
    changePasswordHandler,
  );

  router.post(
    '/api/v1/auth/email-change',
    {
      config: { rateLimit: 'auth-email-change', auth: 'required' },
      schema: {
        body: requestEmailChangeBodySchema,
        response: { 200: requestEmailChangeResponseSchema },
      },
    },
    requestEmailChangeHandler,
  );

  router.post(
    '/api/v1/auth/email-change/verify',
    {
      config: { rateLimit: 'auth-email-verification', auth: 'public' },
      schema: {
        body: verifyEmailChangeBodySchema,
        response: { 200: profileResponseSchema },
      },
    },
    verifyEmailChangeHandler,
  );
}
