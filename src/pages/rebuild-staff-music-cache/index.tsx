// This exists due to a flaw in the way the music cache is updated.
// Ideally, the music cache should be updated when the music is updated.

import { useEffect, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { LoadingButton } from '@mui/lab';
import { Paper } from '@mui/material';
import {
  deleteField,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useSnackbar } from 'notistack';
import {
  AutocompleteElement,
  FormContainer,
  useForm,
} from 'react-hook-form-mui';
import { z } from 'zod';

import { GenericHeader, MainLayout } from '~/components';
import {
  auth,
  cacheCollection,
  musicCollection,
  staffInfosCollection,
} from '~/configs';
import { StaffInfoCacheSchema } from '~/schemas';
import { revalidatePaths } from '~/utils';

const RebuildStaffMusicCache = () => {
  const { enqueueSnackbar } = useSnackbar();

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

      // split the musicIds into chunks of 30
      // due to 'in' query limit
      const musicIdsChunks = musicIds.reduce<string[][]>(
        (acc, curr) => {
          const last = acc[acc.length - 1]!;
          if (last.length < 30) {
            last.push(curr);
          } else {
            acc.push([curr]);
          }
          return acc;
        },
        [[]]
      );

      const musicQuerySnaps = await Promise.all(
        musicIdsChunks.map((chunk) =>
          getDocs(query(musicCollection, where(documentId(), 'in', chunk)))
        )
      );

      const newCachedMusic = musicQuerySnaps.reduce(
        (acc: Record<string, unknown>, snap) => {
          snap.forEach((docSnap) => {
            const musicId = docSnap.id;
            acc[`cachedMusic.${musicId}`] = docSnap.data();
          });

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
            loading={isLoadingStaffInfoCache}
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
