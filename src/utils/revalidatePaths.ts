import type { EnqueueSnackbar } from 'notistack';

export const revalidatePaths = async (
  paths: string[],
  token: string,
  enqueueSnackbar?: EnqueueSnackbar
) => {
  const fn = async () =>
    await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/revalidate?` +
        new URLSearchParams({
          paths: paths.join(','),
        }),
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );

  // Revalidate the paths. If it fails, try again 2 more times.
  // Vercel has a 10s limit on serverless functions (hobby plan).
  try {
    await fn();
  } catch (err) {
    try {
      // eslint-disable-next-line no-console
      console.warn('Retrying revalidation (1/2)');
      await fn();
    } catch (err) {
      try {
        // eslint-disable-next-line no-console
        console.warn('Retrying revalidation (2/2)');
        await fn();
      } catch (err) {
        console.error('Failed to revalidate paths:', paths);
        if (enqueueSnackbar) {
          enqueueSnackbar(
            'Failed to revalidate paths. See console for details.',
            { variant: 'warning' }
          );
        }
      }
    }
  }
};
