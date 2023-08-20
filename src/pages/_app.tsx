import { createRef } from 'react';

import { CacheProvider } from '@emotion/react';
import type { EmotionCache } from '@emotion/react';
import { IconButton } from '@mui/material';
import { AppProps } from 'next/app';
import Head from 'next/head';
import { ThemeProvider as NextThemeProvider } from 'next-themes';
import { SnackbarProvider } from 'notistack';
import { MdClose } from 'react-icons/md';
import { z } from 'zod';

import { PageProvider } from '~/contexts';
import { createEmotionCache } from '~/utils';

const clientSideEmotionCache = createEmotionCache();

export interface MyAppProps extends AppProps {
  emotionCache?: EmotionCache;
}

z.setErrorMap((issue, ctx) => {
  if (issue.code === 'too_small' && issue.minimum === 1) {
    return { message: 'This field is required.' };
  }
  return { message: ctx.defaultError };
});

export default function MyApp(props: MyAppProps) {
  const { Component, emotionCache = clientSideEmotionCache, pageProps } = props;

  const notistackRef = createRef<any>();

  const onClickDismiss = (key: any) => () => {
    notistackRef?.current?.closeSnackbar(key);
  };

  return (
    <PageProvider emotionCache={emotionCache}>
      <NextThemeProvider>
        <CacheProvider value={emotionCache}>
          <Head>
            <meta
              name='viewport'
              content='initial-scale=1, width=device-width'
            />
          </Head>
          <SnackbarProvider
            ref={notistackRef}
            action={(key) => (
              <IconButton onClick={onClickDismiss(key)} sx={{ color: 'white' }}>
                <MdClose />
              </IconButton>
            )}
          >
            <Component {...pageProps} />
          </SnackbarProvider>
        </CacheProvider>
      </NextThemeProvider>
    </PageProvider>
  );
}
