// This exists due to a flaw in the way the music cache is updated.
// Ideally, the music cache should be updated when the music is updated.

import { useEffect, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { LoadingButton } from '@mui/lab';
import { Paper } from '@mui/material';
import {
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useSnackbar } from 'notistack';
import {
  AutocompleteElement,
  FormContainer,
  useForm,
} from 'react-hook-form-mui';
import { z } from 'zod';

import { GenericHeader, MainLayout } from '~/components';
import { auth, cacheCollection, staffInfosCollection } from '~/configs';
import { MusicCacheSchema, StaffInfoCacheSchema } from '~/schemas';
import { revalidatePaths } from '~/utils';

const RebuildStaffMusicCache = () => {
  const { enqueueSnackbar } = useSnackbar();

  const [musicCache, setMusicCache] = useState<
    Record<string, MusicCacheSchema>
  >({});
  const [isLoadingMusicCache, setIsLoadingMusicCache] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(cacheCollection, 'music'), (docSnap) => {
      setMusicCache(docSnap.data() || {});
      setIsLoadingMusicCache(false);
    });

    return () => unsubscribe();
  }, []);

  const [staffInfoCache, setStaffInfoCache] = useState<
    Record<string, StaffInfoCacheSchema>
  >({});
  const [isLoadingStaffInfoCache, setIsLoadingStaffInfoCache] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(cacheCollection, 'staffInfo'),
      (docSnap) => {
        setStaffInfoCache(docSnap.data() || {});
        setIsLoadingStaffInfoCache(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const schema = z.object({
    staffId: z.string().refine((value) => value in staffInfoCache),
  });

  type Schema = z.infer<typeof schema>;

  const formContext = useForm<Schema>({
    defaultValues: {
      staffId: '',
    },
    resolver: zodResolver(schema),
  });

  const {
    formState: { isSubmitting },
    handleSubmit,
  } = formContext;

  const handleSave = async ({ staffId }: Schema) => {
    if (!auth.currentUser) {
      enqueueSnackbar('You must be logged in to perform this action.', {
        variant: 'error',
      });
    }

    try {
      // get auth token for revalidation
      const tokenRes = await auth.currentUser?.getIdTokenResult(true);

      if (tokenRes?.claims?.role !== 'admin') {
        enqueueSnackbar('Insufficient permissions.', { variant: 'error' });
        return;
      }

      const staffInfo = await getDoc(doc(staffInfosCollection, staffId));

      if (!staffInfo.exists()) {
        enqueueSnackbar('Staff info does not exist.', { variant: 'error' });
        return;
      }

      const musicIds = staffInfo.data().musicIds;

      const newCachedMusic: {
        [key: string]: MusicCacheSchema;
      } = musicIds.reduce(
        (acc: Record<string, MusicCacheSchema>, musicId: string) => {
          if (musicId in musicCache) {
            acc[`cachedMusic.${musicId}`] = musicCache[musicId]!;
          }
          return acc;
        },
        {}
      );

      await updateDoc(doc(staffInfosCollection, staffId), {
        ...musicIds.reduce((acc: Record<string, unknown>, musicId: string) => {
          acc[`cachedMusic.${musicId}`] = deleteField();
          return acc;
        }, {}),
        ...newCachedMusic,
        updatedAt: serverTimestamp(),
      });

      await revalidatePaths([`/staff/${staffId}`], tokenRes.token);

      enqueueSnackbar('Cache rebuilt successfully.', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar('Failed to rebuild cache.', { variant: 'error' });
      console.error(err);
    }
  };

  return (
    <MainLayout title='Rebuild Staff Music Cache'>
      <GenericHeader title='Rebuild Staff Music Cache' gutterBottom />
      <FormContainer
        formContext={formContext}
        handleSubmit={handleSubmit(handleSave, (err) => console.error(err))}
      >
        <Paper sx={{ px: 3, py: 2, mb: 2 }}>
          <AutocompleteElement
            name='staffId'
            label='Staff'
            options={Object.entries(staffInfoCache).map(
              ([id, { name: label }]) => ({
                id,
                label,
              })
            )}
            loading={isLoadingStaffInfoCache || isLoadingMusicCache}
            autocompleteProps={{
              fullWidth: true,
            }}
            textFieldProps={{
              margin: 'normal',
            }}
            matchId
          />
        </Paper>
        <LoadingButton
          type='submit'
          variant='contained'
          loading={isSubmitting}
          fullWidth
        >
          Submit
        </LoadingButton>
      </FormContainer>
    </MainLayout>
  );
};

export default RebuildStaffMusicCache;
