import { SessionProvider } from "next-auth/react";
import Head from 'next/head';

export default function App({ Component, pageProps }) {
  return (
    <SessionProvider session={pageProps.session}>
      <Head>
        <title>VibeGPT</title>
        <link rel="icon" href="/logotab.png" type="image/png" />
      </Head>
      <Component {...pageProps} />
    </SessionProvider>
  );
} 