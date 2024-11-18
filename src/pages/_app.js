import { SessionProvider } from "next-auth/react";

export default function App({ Component, pageProps }) {
  return (
    <SessionProvider session={pageProps.session}>
      <Head>
        <title>VibeGPT</title>
        <link rel="icon" href="/logotab.png" />
      </Head>
      <Component {...pageProps} />
    </SessionProvider>
  );
} 