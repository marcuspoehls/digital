import React from 'react';
import Head from 'next/head';

import fetchCommissions, {
  Commission,
} from '../../client/graphql/fetch-commissions';

import { AppLayout } from '@cityofboston/react-fleet';

import ApplicationForm from '../../client/ApplicationForm';
import ApplicationSubmitted from '../../client/ApplicationSubmitted';
import { NextContext } from '@cityofboston/next-client-common';
import { IncomingMessage } from 'http';
import { Formik } from 'formik';
import { ApplyFormValues, applyFormSchema } from '../../lib/validationSchema';

interface Props {
  commissions: Commission[];
  commissionID?: string;
  testSubmittedPage?: boolean;
}

interface State {
  applicationSubmitted: boolean;
  submissionError: boolean;
}

export default class ApplyPage extends React.Component<Props, State> {
  // We want the HTML <form> element directly for submitting, so we can easily
  // build a FormData object out of it. This is important for sending the
  // uploaded file data along.
  private formRef = React.createRef<HTMLFormElement>();

  constructor(props: Props) {
    super(props);

    this.state = {
      applicationSubmitted: !!props.testSubmittedPage,
      submissionError: false,
    };
  }

  static async getInitialProps({
    query: { commissionID },
  }: NextContext<IncomingMessage>): Promise<Props> {
    const commissions = await fetchCommissions();

    return { commissions, commissionID };
  }

  handleSubmit = async () => {
    const form = this.formRef.current;
    if (!form) {
      return;
    }

    this.setState({
      applicationSubmitted: false,
      submissionError: false,
    });

    // This will include the uploaded files
    const data = new FormData(form);

    try {
      const resp = await fetch('/commissions/submit', {
        method: 'POST',
        body: data,
      });

      if (!resp.ok) {
        throw new Error(`Got ${resp.status} response to apply`);
      }

      this.setState({ applicationSubmitted: true });
    } catch (e) {
      this.setState({
        submissionError: true,
      });

      const Rollbar = (window as any).Rollbar;
      Rollbar.error(e);
    }
  };

  render() {
    const { commissions, commissionID } = this.props;

    const initialFormValues: ApplyFormValues = {
      firstName: '',
      middleName: '',
      lastName: '',
      streetAddress: '',
      unit: '',
      city: '',
      state: '',
      zip: '',
      phone: '',
      email: '',
      confirmEmail: '',
      commissionIds: commissionID ? [commissionID] : [],
      degreeAttained: '',
      educationalInstitution: '',
      otherInformation: '',
      coverLetter: null,
      resume: null,
    };

    const commissionsWithoutOpenSeats = commissions
      .filter(commission => commission.openSeats === 0)
      .sort((current, next) => current.name.localeCompare(next.name));

    const commissionsWithOpenSeats = commissions
      .filter(commission => commission.openSeats > 0)
      .sort((current, next) => current.name.localeCompare(next.name));

    return (
      <AppLayout>
        <Head>
          <title>Apply for a Board or Commission | Boston.gov</title>
        </Head>

        <div className="mn ">
          <div className="b-c b-c--ntp">
            {this.state.applicationSubmitted ? (
              <ApplicationSubmitted />
            ) : (
              <Formik
                initialValues={initialFormValues}
                validationSchema={applyFormSchema}
                onSubmit={async (_, { setSubmitting }) => {
                  try {
                    // handleSubmit reads directly from the <form>, so we
                    // don’t pass the current values.
                    await this.handleSubmit();
                  } finally {
                    setSubmitting(false);
                  }
                }}
                render={formikProps => (
                  <ApplicationForm
                    {...formikProps}
                    commissionsWithOpenSeats={commissionsWithOpenSeats}
                    commissionsWithoutOpenSeats={commissionsWithoutOpenSeats}
                    formRef={this.formRef}
                    submissionError={this.state.submissionError}
                    clearSubmissionError={() =>
                      this.setState({ submissionError: false })
                    }
                  />
                )}
              />
            )}
          </div>
        </div>
      </AppLayout>
    );
  }
}
