import React from 'react';
import Head from 'next/head';
import { Formik } from 'formik';

import { PUBLIC_CSS_URL } from '@cityofboston/react-fleet';

import AccessBostonHeader from '../client/AccessBostonHeader';

import fetchAccount, { Account } from '../client/graphql/fetch-account';
import addMfaDevice, {
  AddMfaDeviceArgs,
} from '../client/graphql/add-mfa-device';

import {
  GetInitialProps,
  GetInitialPropsDependencies,
  PageDependencies,
} from './_app';

import DeviceVerificationForm, {
  validationSchema,
  FormValues,
} from '../client/device-verification/DeviceVerificationForm';

import DeviceVerificationModal, {
  VerificationStatus,
} from '../client/device-verification/DeviceVerificationModal';
import verifyMfaDevice from '../client/graphql/verify-mfa-device';

import { MfaError } from '../client/graphql/queries';
import RedirectForm from '../client/RedirectForm';

interface InitialProps {
  account: Account;
}

interface Props extends InitialProps, Pick<PageDependencies, 'fetchGraphql'> {
  /** Used for Storybook tests */
  testVerificationCodeModal?: boolean;
}

interface State {
  status: VerificationStatus;
  verificationError: string | null;
  sessionId: string | null;
}

export default class RegisterMfaPage extends React.Component<Props, State> {
  private readonly formikRef = React.createRef<Formik<FormValues>>();
  private readonly doneRedirectRef = React.createRef<RedirectForm>();

  constructor(props: Props) {
    super(props);

    this.state = {
      status: VerificationStatus.NONE,
      verificationError: null,
      sessionId: null,
    };
  }

  static getInitialProps: GetInitialProps<InitialProps> = async (
    _,
    { fetchGraphql }: GetInitialPropsDependencies
  ) => {
    // We need to do this up top because if the forgot password succeeds on a
    // POST it torches the session.
    const account = await fetchAccount(fetchGraphql);

    return {
      account,
    };
  };

  private formValuesToAddDeviceArgs({
    phoneOrEmail,
    smsOrVoice,
    phoneNumber,
    email,
  }: FormValues): AddMfaDeviceArgs {
    let type;

    if (phoneOrEmail === 'email') {
      type = 'EMAIL';
    } else if (smsOrVoice === 'sms') {
      type = 'SMS';
    } else {
      type = 'VOICE';
    }

    return { email, phoneNumber, type };
  }

  private handleSubmit = async (values: FormValues, { setSubmitting }) => {
    try {
      this.setState({
        status: VerificationStatus.SENDING,
        verificationError: null,
        sessionId: null,
      });

      const { sessionId, error } = await addMfaDevice(
        this.props.fetchGraphql,
        this.formValuesToAddDeviceArgs(values)
      );

      if (error) {
        // Will get caught below.
        throw new Error(error);
      } else {
        this.setState({
          status: VerificationStatus.SENT,
          sessionId,
        });
      }
    } catch (e) {
      // Stopping the submission process closes the modal.
      setSubmitting(false);

      this.setState({
        status: VerificationStatus.NONE,
        verificationError: e.toString(),
      });
    }
  };

  resendVerification = () => {
    const formik = this.formikRef.current;

    if (formik) {
      formik.setSubmitting(false);
      formik.submitForm();
    }
  };

  resetVerification = () => {
    const formik = this.formikRef.current;

    if (formik) {
      formik.resetForm();
    }

    this.setState({
      status: VerificationStatus.NONE,
      sessionId: null,
      verificationError: null,
    });
  };

  validateCode = async (code: string) => {
    const { fetchGraphql } = this.props;
    const { status, sessionId } = this.state;

    if (!sessionId || status === VerificationStatus.CHECKING) {
      return;
    }

    this.setState({
      status: VerificationStatus.CHECKING,
      verificationError: null,
    });

    try {
      const { success, error } = await verifyMfaDevice(
        fetchGraphql,
        sessionId,
        code
      );

      if (success) {
        this.doneRedirectRef.current!.redirect();
      } else if (error === MfaError.WRONG_PASSWORD) {
        this.setState({ status: VerificationStatus.INCORRECT_CODE });
      } else {
        this.setState({ status: VerificationStatus.OTHER_ERROR });
      }
    } catch (e) {
      this.setState({ status: VerificationStatus.OTHER_ERROR });
    }
  };

  render() {
    const { account, testVerificationCodeModal } = this.props;
    const { status, verificationError } = this.state;

    const initialValues: FormValues = {
      phoneOrEmail: 'phone',
      smsOrVoice: 'sms',
      email: '',
      phoneNumber: '',
    };

    return (
      <>
        <Head>
          <link rel="stylesheet" href={PUBLIC_CSS_URL} />
          <title>Access Boston: Add Security Noun</title>
        </Head>

        <AccessBostonHeader account={account} />

        <Formik
          ref={this.formikRef as any}
          initialValues={initialValues}
          isInitialValid={false}
          validationSchema={validationSchema}
          onSubmit={this.handleSubmit}
          render={formikProps => (
            <>
              <DeviceVerificationForm
                {...formikProps}
                serverError={verificationError}
              />

              {(formikProps.isSubmitting || testVerificationCodeModal) && (
                <DeviceVerificationModal
                  status={status}
                  {...this.formValuesToAddDeviceArgs(formikProps.values)}
                  resendVerification={this.resendVerification}
                  resetVerification={this.resetVerification}
                  validateCode={this.validateCode}
                />
              )}
            </>
          )}
        />

        <RedirectForm ref={this.doneRedirectRef} path="/done" />
      </>
    );
  }
}