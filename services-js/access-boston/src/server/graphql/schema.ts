/**
 * @file This file defines the GraphQL schema and resolvers for our server.
 *
 * Run `npm run generate-graphql-schema` to use `ts2gql` to turn this file into
 * the `schema.graphql` file that can be consumed by this and other tools.
 *
 * The output is generated in the “graphql” directory in the package root so
 * that it can be `readFileSync`’d from both `build` (during dev and production)
 * and `src` (during test).
 */
import fs from 'fs';
import path from 'path';

import { makeExecutableSchema } from 'graphql-tools';
import Boom from 'boom';

import { Resolvers } from '@cityofboston/graphql-typescript';

import AppsRegistry from '../services/AppsRegistry';
import Session from '../Session';
import IdentityIq from '../services/IdentityIq';
import PingId, { VerificationType } from '../services/PingId';

import {
  changePasswordMutation,
  resetPasswordMutation,
  Workflow,
  workflowQuery,
} from './workflows';

import {
  addMfaDeviceMutation,
  AddMfaDeviceResponse,
  VerifyMfaDeviceResponse,
  verifyMfaDeviceMutation,
} from './mfa';

/** @graphql schema */
export interface Schema {
  query: Query;
  mutation: Mutation;
}

export interface Query {
  account: Account;
  apps: Apps;
  workflow(args: { caseId: string }): Workflow;
}

export interface Mutation {
  changePassword(args: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): Workflow;

  /**
   * Resets the password. Requires that the user be logged in with the "forgot
   * password" authentication.
   */
  resetPassword(args: {
    newPassword: string;
    confirmPassword: string;
    token: string;
  }): Workflow;

  addMfaDevice(args: {
    phoneNumber?: string;
    email?: string;
    type: VerificationType;
  }): AddMfaDeviceResponse;

  verifyMfaDevice(args: {
    sessionId: string;
    pairingCode: string;
  }): VerifyMfaDeviceResponse;
}

export interface Account {
  employeeId: string;
  registered: boolean;
  needsNewPassword: boolean;
  needsMfaDevice: boolean;
  resetPasswordToken: string;
}

export interface Apps {
  categories: AppCategory[];
}

export interface AppCategory {
  title: string;
  showIcons: boolean;
  requestAccessUrl: string | null;

  apps: App[];
}

export interface App {
  title: string;
  url: string;
  iconUrl: string | null;
  description: string;
}

// This file is built by the "generate-graphql-schema" script from
// the above interfaces.
const schemaGraphql = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'graphql', 'schema.graphql'),
  'utf-8'
);

export interface Context {
  session: Session;
  appsRegistry: AppsRegistry;
  identityIq: IdentityIq;
  pingId: PingId;
}

export type QueryRootResolvers = Resolvers<Query, Context>;
export type MutationResolvers = Resolvers<Mutation, Context>;

const queryRootResolvers: QueryRootResolvers = {
  account: (
    _root,
    _args,
    { session: { loginAuth, forgotPasswordAuth, loginSession } }
  ) => {
    if (loginAuth) {
      const { userId } = loginAuth;
      const { needsMfaDevice, needsNewPassword } = loginSession!;

      return {
        employeeId: userId,
        // We set this explicitly rather than have all places that need it have
        // to derive it from the other two booleans.
        registered: !needsMfaDevice && !needsNewPassword,
        needsMfaDevice,
        needsNewPassword,
        resetPasswordToken: '',
      };
    } else if (forgotPasswordAuth) {
      return {
        employeeId: forgotPasswordAuth.userId,
        // These aren't used in forgot password states, so it doesn’t matter
        // what we return here.
        registered: false,
        needsMfaDevice: false,
        needsNewPassword: false,
        resetPasswordToken: forgotPasswordAuth.resetPasswordToken,
      };
    } else {
      throw Boom.forbidden();
    }
  },

  apps: (_root, _args, { appsRegistry, session: { loginSession } }) => {
    if (!loginSession) {
      throw Boom.forbidden();
    }

    return {
      categories: appsRegistry
        .appsForGroups(loginSession.groups)
        .map(({ apps, icons, showRequestAccessLink, title }) => ({
          title,
          showIcons: icons,
          requestAccessUrl: showRequestAccessLink ? '#' : null,
          apps: apps.map(({ title, iconUrl, url, description }) => ({
            title,
            iconUrl: iconUrl || null,
            url,
            description,
          })),
        })),
    };
  },

  workflow: workflowQuery,
};

const mutationResolvers: MutationResolvers = {
  changePassword: changePasswordMutation,
  resetPassword: resetPasswordMutation,
  addMfaDevice: addMfaDeviceMutation,
  verifyMfaDevice: verifyMfaDeviceMutation,
};

export default makeExecutableSchema({
  typeDefs: [schemaGraphql],
  // We typecheck our own resolvers, so we set this as "any". Otherwise our
  // precise "args" typing conflicts with the general {[argument: string]: any}
  // type that the library gives them.
  resolvers: [
    {
      Query: queryRootResolvers,
      Mutation: mutationResolvers,
    },
  ] as any,
  allowUndefinedInResolve: false,
});
