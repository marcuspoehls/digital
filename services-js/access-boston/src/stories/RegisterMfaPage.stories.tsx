import React from 'react';
import { storiesOf } from '@storybook/react';

import RegisterMfaPage from '../pages/mfa';
import { Account } from '../client/graphql/fetch-account';

const ACCOUNT: Account = {
  employeeId: 'CON01234',
  registered: true,
  needsMfaDevice: false,
  needsNewPassword: false,
  resetPasswordToken: '',
};

storiesOf('RegisterMfaPage', module)
  .add('default', () => (
    <RegisterMfaPage
      account={ACCOUNT}
      phoneOrEmail="phone"
      fetchGraphql={null as any}
    />
  ))
  .add('email', () => (
    <RegisterMfaPage
      account={ACCOUNT}
      phoneOrEmail="email"
      fetchGraphql={null as any}
    />
  ))
  .add('modal open', () => (
    <RegisterMfaPage
      account={ACCOUNT}
      phoneOrEmail="phone"
      fetchGraphql={null as any}
      testVerificationCodeModal
    />
  ));
