import React from 'react';
import Document, { Head, Main, NextScript } from 'next/document';
import { extractCritical } from 'emotion-server';

import getConfig from 'next/config';

import { useStaticRendering as mobxUseStaticRendering } from 'mobx-react';
import { ContactForm } from '@cityofboston/react-fleet';
import { ScreenReaderSupport } from '@cityofboston/next-client-common';

import makeCss from '../lib/make-css';

import headerHtml from '../templates/header.html';
import navigationHtml from '../templates/navigation.html';
import LiveAgent from '../data/store/LiveAgent';

type Props = {
  __NEXT_DATA__: any;
  ids: string[];
  css: string;
  rollbarAccessToken: string | undefined;
  rollbarEnvironment: string | undefined;
};

export default class extends Document {
  props: Props;

  static async getInitialProps({ renderPage }) {
    const page = renderPage();
    let styles = {};

    if (page.html) {
      styles = extractCritical(page.html);
    } else if (page.errorHtml) {
      styles = extractCritical(page.errorHtml);
    }

    return {
      ...page,
      ...styles,
      rollbarAccessToken: process.env.ROLLBAR_BROWSER_ACCESS_TOKEN,
      rollbarEnvironment:
        process.env.ROLLBAR_ENVIRONMENT || process.env.NODE_ENV,
    };
  }

  constructor(props: Props) {
    super(props);

    this.props = props;

    mobxUseStaticRendering(true);

    const { __NEXT_DATA__, ids } = props;
    if (ids) {
      __NEXT_DATA__.ids = ids;
    }
  }

  render() {
    const {
      css: additionalCss,
      rollbarAccessToken,
      rollbarEnvironment,
    } = this.props;
    const {
      publicRuntimeConfig: { cacheParam },
    } = getConfig();

    return (
      <html lang="en" className="js flexbox">
        <Head>
          <meta httpEquiv="x-ua-compatible" content="ie=edge" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="apple-mobile-web-app-title" content="BOS:311" />
          <link
            rel="shortcut icon"
            type="image/png"
            href="/assets/icons/favicon-96x96.png"
          />

          <link
            rel="apple-touch-icon"
            href="/assets/icons/apple-icon-57x57.png"
          />
          <link
            rel="apple-touch-icon"
            sizes="114x114"
            href="/assets/icons/apple-icon-114x114.png"
          />
          <link
            rel="apple-touch-icon"
            sizes="120x120"
            href="/assets/icons/apple-icon-120x120.png"
          />
          <link
            rel="apple-touch-icon"
            sizes="152x152"
            href="/assets/icons/apple-icon-152x152.png"
          />
          <link
            rel="apple-touch-icon"
            sizes="180x180"
            href="/assets/icons/apple-icon-180x180.png"
          />

          <link
            rel="icon"
            sizes="192x192"
            href="/assets/icons/android-icon-192x192.png"
          />

          {makeCss({ cacheParam, additionalCss })}

          {rollbarAccessToken && (
            <script
              type="text/javascript"
              dangerouslySetInnerHTML={{
                __html: `
            var _rollbarConfig = {
                accessToken: "${rollbarAccessToken}",
                captureUncaught: true,
                captureUnhandledRejections: true,
                payload: {
                    environment: "${rollbarEnvironment}"
                }
            };
            // Rollbar Snippet
            !function(r){function e(n){if(o[n])return o[n].exports;var t=o[n]={exports:{},id:n,loaded:!1};return r[n].call(t.exports,t,t.exports,e),t.loaded=!0,t.exports}var o={};return e.m=r,e.c=o,e.p="",e(0)}([function(r,e,o){"use strict";var n=o(1),t=o(4);_rollbarConfig=_rollbarConfig||{},_rollbarConfig.rollbarJsUrl=_rollbarConfig.rollbarJsUrl||"https://cdnjs.cloudflare.com/ajax/libs/rollbar.js/2.5.1/rollbar.min.js",_rollbarConfig.async=void 0===_rollbarConfig.async||_rollbarConfig.async;var a=n.setupShim(window,_rollbarConfig),l=t(_rollbarConfig);window.rollbar=n.Rollbar,a.loadFull(window,document,!_rollbarConfig.async,_rollbarConfig,l)},function(r,e,o){"use strict";function n(r){return function(){try{return r.apply(this,arguments)}catch(r){try{console.error("[Rollbar]: Internal error",r)}catch(r){}}}}function t(r,e){this.options=r,this._rollbarOldOnError=null;var o=s++;this.shimId=function(){return o},"undefined"!=typeof window&&window._rollbarShims&&(window._rollbarShims[o]={handler:e,messages:[]})}function a(r,e){if(r){var o=e.globalAlias||"Rollbar";if("object"==typeof r[o])return r[o];r._rollbarShims={},r._rollbarWrappedError=null;var t=new p(e);return n(function(){e.captureUncaught&&(t._rollbarOldOnError=r.onerror,i.captureUncaughtExceptions(r,t,!0),i.wrapGlobals(r,t,!0)),e.captureUnhandledRejections&&i.captureUnhandledRejections(r,t,!0);var n=e.autoInstrument;return e.enabled!==!1&&(void 0===n||n===!0||"object"==typeof n&&n.network)&&r.addEventListener&&(r.addEventListener("load",t.captureLoad.bind(t)),r.addEventListener("DOMContentLoaded",t.captureDomContentLoaded.bind(t))),r[o]=t,t})()}}function l(r){return n(function(){var e=this,o=Array.prototype.slice.call(arguments,0),n={shim:e,method:r,args:o,ts:new Date};window._rollbarShims[this.shimId()].messages.push(n)})}var i=o(2),s=0,d=o(3),c=function(r,e){return new t(r,e)},p=d.bind(null,c);t.prototype.loadFull=function(r,e,o,t,a){var l=function(){var e;if(void 0===r._rollbarDidLoad){e=new Error("rollbar.js did not load");for(var o,n,t,l,i=0;o=r._rollbarShims[i++];)for(o=o.messages||[];n=o.shift();)for(t=n.args||[],i=0;i<t.length;++i)if(l=t[i],"function"==typeof l){l(e);break}}"function"==typeof a&&a(e)},i=!1,s=e.createElement("script"),d=e.getElementsByTagName("script")[0],c=d.parentNode;s.crossOrigin="",s.src=t.rollbarJsUrl,o||(s.async=!0),s.onload=s.onreadystatechange=n(function(){if(!(i||this.readyState&&"loaded"!==this.readyState&&"complete"!==this.readyState)){s.onload=s.onreadystatechange=null;try{c.removeChild(s)}catch(r){}i=!0,l()}}),c.insertBefore(s,d)},t.prototype.wrap=function(r,e,o){try{var n;if(n="function"==typeof e?e:function(){return e||{}},"function"!=typeof r)return r;if(r._isWrap)return r;if(!r._rollbar_wrapped&&(r._rollbar_wrapped=function(){o&&"function"==typeof o&&o.apply(this,arguments);try{return r.apply(this,arguments)}catch(o){var e=o;throw e&&("string"==typeof e&&(e=new String(e)),e._rollbarContext=n()||{},e._rollbarContext._wrappedSource=r.toString(),window._rollbarWrappedError=e),e}},r._rollbar_wrapped._isWrap=!0,r.hasOwnProperty))for(var t in r)r.hasOwnProperty(t)&&(r._rollbar_wrapped[t]=r[t]);return r._rollbar_wrapped}catch(e){return r}};for(var u="log,debug,info,warn,warning,error,critical,global,configure,handleUncaughtException,handleUnhandledRejection,captureEvent,captureDomContentLoaded,captureLoad".split(","),f=0;f<u.length;++f)t.prototype[u[f]]=l(u[f]);r.exports={setupShim:a,Rollbar:p}},function(r,e){"use strict";function o(r,e,o){if(r){var t;"function"==typeof e._rollbarOldOnError?t=e._rollbarOldOnError:r.onerror&&!r.onerror.belongsToShim&&(t=r.onerror,e._rollbarOldOnError=t);var a=function(){var o=Array.prototype.slice.call(arguments,0);n(r,e,t,o)};a.belongsToShim=o,r.onerror=a}}function n(r,e,o,n){r._rollbarWrappedError&&(n[4]||(n[4]=r._rollbarWrappedError),n[5]||(n[5]=r._rollbarWrappedError._rollbarContext),r._rollbarWrappedError=null),e.handleUncaughtException.apply(e,n),o&&o.apply(r,n)}function t(r,e,o){if(r){"function"==typeof r._rollbarURH&&r._rollbarURH.belongsToShim&&r.removeEventListener("unhandledrejection",r._rollbarURH);var n=function(r){var o,n,t;try{o=r.reason}catch(r){o=void 0}try{n=r.promise}catch(r){n="[unhandledrejection] error getting \`promise\` from event"}try{t=r.detail,!o&&t&&(o=t.reason,n=t.promise)}catch(r){t="[unhandledrejection] error getting \`detail\` from event"}o||(o="[unhandledrejection] error getting \`reason\` from event"),e&&e.handleUnhandledRejection&&e.handleUnhandledRejection(o,n)};n.belongsToShim=o,r._rollbarURH=n,r.addEventListener("unhandledrejection",n)}}function a(r,e,o){if(r){var n,t,a="EventTarget,Window,Node,ApplicationCache,AudioTrackList,ChannelMergerNode,CryptoOperation,EventSource,FileReader,HTMLUnknownElement,IDBDatabase,IDBRequest,IDBTransaction,KeyOperation,MediaController,MessagePort,ModalWindow,Notification,SVGElementInstance,Screen,TextTrack,TextTrackCue,TextTrackList,WebSocket,WebSocketWorker,Worker,XMLHttpRequest,XMLHttpRequestEventTarget,XMLHttpRequestUpload".split(",");for(n=0;n<a.length;++n)t=a[n],r[t]&&r[t].prototype&&l(e,r[t].prototype,o)}}function l(r,e,o){if(e.hasOwnProperty&&e.hasOwnProperty("addEventListener")){for(var n=e.addEventListener;n._rollbarOldAdd&&n.belongsToShim;)n=n._rollbarOldAdd;var t=function(e,o,t){n.call(this,e,r.wrap(o),t)};t._rollbarOldAdd=n,t.belongsToShim=o,e.addEventListener=t;for(var a=e.removeEventListener;a._rollbarOldRemove&&a.belongsToShim;)a=a._rollbarOldRemove;var l=function(r,e,o){a.call(this,r,e&&e._rollbar_wrapped||e,o)};l._rollbarOldRemove=a,l.belongsToShim=o,e.removeEventListener=l}}r.exports={captureUncaughtExceptions:o,captureUnhandledRejections:t,wrapGlobals:a}},function(r,e){"use strict";function o(r,e){this.impl=r(e,this),this.options=e,n(o.prototype)}function n(r){for(var e=function(r){return function(){var e=Array.prototype.slice.call(arguments,0);if(this.impl[r])return this.impl[r].apply(this.impl,e)}},o="log,debug,info,warn,warning,error,critical,global,configure,handleUncaughtException,handleUnhandledRejection,_createItem,wrap,loadFull,shimId,captureEvent,captureDomContentLoaded,captureLoad".split(","),n=0;n<o.length;n++)r[o[n]]=e(o[n])}o.prototype._swapAndProcessMessages=function(r,e){this.impl=r(this.options);for(var o,n,t;o=e.shift();)n=o.method,t=o.args,this[n]&&"function"==typeof this[n]&&("captureDomContentLoaded"===n||"captureLoad"===n?this[n].apply(this,[t[0],o.ts]):this[n].apply(this,t));return this},r.exports=o},function(r,e){"use strict";r.exports=function(r){return function(e){if(!e&&!window._rollbarInitialized){r=r||{};for(var o,n,t=r.globalAlias||"Rollbar",a=window.rollbar,l=function(r){return new a(r)},i=0;o=window._rollbarShims[i++];)n||(n=o.handler),o.handler._swapAndProcessMessages(l,o.messages);window[t]=n,window._rollbarInitialized=!0}}}}]);
            // End Rollbar Snippet
          `,
              }}
            />
          )}

          {process.env.GOOGLE_TRACKING_ID && (
            <script
              type="text/javascript"
              dangerouslySetInnerHTML={{
                __html: `
              (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
              (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
              m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
              })(window,document,'script','https://www.google-analytics.com/analytics.js','ga');

              ga('create', '${process.env.GOOGLE_TRACKING_ID}', 'auto', {
                siteSpeedSampleRate: 10,
              });
              ga('send', 'pageview');
          `,
              }}
            />
          )}
        </Head>

        <body>
          <input
            type="checkbox"
            id="brg-tr"
            className="brg-tr"
            aria-hidden="true"
          />
          <nav
            className="nv-m"
            dangerouslySetInnerHTML={{ __html: navigationHtml }}
          />
          <div className="mn mn--nv-s">
            <input
              type="checkbox"
              id="s-tr"
              className="s-tr"
              aria-hidden="true"
            />
            <header
              className="h"
              role="banner"
              dangerouslySetInnerHTML={{ __html: headerHtml }}
            />

            <Main />

            <ScreenReaderSupport.AnnounceElement />
          </div>
          <script
            src={`${process.env.WEB_COMPONENTS_URI ||
              'https://patterns.boston.gov/web-components/fleetcomponents.js'}?k=${cacheParam}`}
          />
          <NextScript />
          <ContactForm
            defaultSubject="BOS:311 Feedback"
            token={process.env.CONTACT_FORM_TOKEN}
            action={process.env.CONTACT_FORM_URL}
          />
          <LiveAgent.SetupScript
            scriptUrl={process.env.LIVE_AGENT_SCRIPT_SRC || ''}
            buttonId={process.env.LIVE_AGENT_BUTTON_ID || ''}
            chatUrl={process.env.LIVE_AGENT_CHAT_URL || ''}
            orgId={process.env.LIVE_AGENT_ORG_ID || ''}
            deploymentId={process.env.LIVE_AGENT_DEPLOYMENT_ID || ''}
          />
          />
        </body>
      </html>
    );
  }
}
