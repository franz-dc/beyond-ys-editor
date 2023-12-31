import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { LoadingButton } from '@mui/lab';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  TextField as MuiTextField,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import {
  arrayRemove,
  arrayUnion,
  deleteField,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { useSnackbar } from 'notistack';
import {
  AutocompleteElement,
  CheckboxElement,
  FormContainer,
  RadioButtonGroup,
  TextFieldElement,
  useFieldArray,
  useForm,
} from 'react-hook-form-mui';
import { z } from 'zod';

import { DatePickerElement, GenericHeader, MainLayout } from '~/components';
import {
  auth,
  cacheCollection,
  charactersCollection,
  db,
  gamesCollection,
  musicCollection,
  storage,
} from '~/configs';
import { CLOUD_STORAGE_URL, GAME_PLATFORMS } from '~/constants';
import {
  CharacterCacheSchema,
  GameCacheSchema,
  GameSchema,
  MusicAlbumCacheSchema,
  MusicCacheSchema,
  gameSchema,
  imageSchema,
} from '~/schemas';
import { formatISO, revalidatePaths } from '~/utils';

const EditGame = () => {
  const { enqueueSnackbar } = useSnackbar();

  const [cachedGames, setCachedGames] = useState<
    Record<string, GameCacheSchema>
  >({});
  const [isLoadingCachedGames, setIsLoadingCachedGames] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(cacheCollection, 'games'), (docSnap) => {
      setCachedGames(docSnap.data() || {});
      setIsLoadingCachedGames(false);
    });

    return () => unsubscribe();
  }, []);

  const [cachedMusicAlbums, setCachedMusicAlbums] = useState<
    Record<string, MusicAlbumCacheSchema>
  >({});
  const [isCachedLoadingMusicAlbums, setIsLoadingCachedMusicAlbums] =
    useState(true);

  // doing this in case someone else added an album while the user is
  // filling this form. this will update the validation in real time
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(cacheCollection, 'musicAlbums'),
      (docSnap) => {
        setCachedMusicAlbums(docSnap.data() || {});
        setIsLoadingCachedMusicAlbums(false);
      }
    );

    return () => unsubscribe();
  }, []);

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

  const [charactersCache, setCharactersCache] = useState<
    Record<string, CharacterCacheSchema>
  >({});
  const [isLoadingCharactersCache, setIsLoadingCharactersCache] =
    useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(cacheCollection, 'characters'),
      (docSnap) => {
        setCharactersCache(docSnap.data() || {});
        setIsLoadingCharactersCache(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const schema = gameSchema
    .omit({
      updatedAt: true,
      cachedSoundtracks: true,
      cachedCharacters: true,
      dependentCharacterIds: true,
      // conform to useFieldArray's format
      platforms: true,
      characterIds: true,
      soundtrackIds: true,
      aliases: true,
    })
    .extend({
      id: z.string().nullable(),
      platforms: z.object({ value: z.string().min(1) }).array(),
      characterIds: z.object({ value: z.string().min(1) }).array(),
      soundtrackIds: z.object({ value: z.string().min(1) }).array(),
      aliases: z.object({ value: z.string().min(1) }).array(),
      releaseDatePrecision: z.enum(['day', 'month', 'year', 'unknown']),
      coverImage: imageSchema
        // check if less than 500x500
        .refine(
          async (value) => {
            if (!value) return true;
            return await new Promise<boolean>((resolve) => {
              const reader = new FileReader();
              reader.readAsDataURL(value);
              reader.onload = (e) => {
                const img = new Image();
                img.src = e.target?.result as string;
                img.onload = () => {
                  const { width, height } = img;
                  resolve(width <= 500 && height <= 500);
                };
              };
            });
          },
          { message: 'Cover must not be bigger than 500x500 pixels.' }
        ),
      bannerImage: imageSchema
        // check if less than 2000x2000
        .refine(
          async (value) => {
            if (!value) return true;
            return await new Promise<boolean>((resolve) => {
              const reader = new FileReader();
              reader.readAsDataURL(value);
              reader.onload = (e) => {
                const img = new Image();
                img.src = e.target?.result as string;
                img.onload = () => {
                  const { width, height } = img;
                  resolve(width <= 2000 && height <= 2000);
                };
              };
            });
          },
          { message: 'Banner must not be bigger than 2000x2000 pixels.' }
        ),
    })
    .refine(
      (data) => {
        const { releaseDate, releaseDatePrecision } = data;

        if (
          ['day', 'month', 'year'].includes(releaseDatePrecision) &&
          !releaseDate
        ) {
          return false;
        }

        return true;
      },
      {
        message: 'Release date is required if precision is not unknown.',
        path: ['releaseDate'],
      }
    );

  type Schema = z.infer<typeof schema>;

  const formContext = useForm<Schema>({
    defaultValues: {
      name: '',
      category: '',
      subcategory: '',
      platforms: [],
      releaseDate: null,
      releaseDatePrecision: 'unknown',
      description: '',
      descriptionSourceName: '',
      descriptionSourceUrl: '',
      characterIds: [],
      characterSpoilerIds: [],
      soundtrackIds: [],
      hasCoverImage: false,
      hasBannerImage: false,
      coverImage: null,
      bannerImage: null,
      aliases: [],
      noLocalizations: false,
    },
    resolver: zodResolver(schema),
  });

  const {
    control,
    register,
    reset,
    trigger,
    watch,
    getValues,
    setValue,
    formState: { isSubmitting, errors },
    handleSubmit,
  } = formContext;

  const currentId = watch('id');
  const characterSpoilerIds = watch('characterSpoilerIds');
  const coverImage = watch('coverImage');
  const bannerImage = watch('bannerImage');
  const hasCoverImage = watch('hasCoverImage');
  const hasBannerImage = watch('hasBannerImage');

  const {
    fields: platforms,
    append: appendPlatform,
    remove: removePlatform,
    swap: swapPlatform,
  } = useFieldArray({
    control,
    name: 'platforms',
  });

  const {
    fields: soundtrackIds,
    append: appendSoundtrack,
    remove: removeSoundtrack,
    swap: swapSoundtrack,
  } = useFieldArray({
    control,
    name: 'soundtrackIds',
  });

  const {
    fields: characterIds,
    append: appendCharacter,
    remove: removeCharacter,
    swap: swapCharacter,
  } = useFieldArray({
    control,
    name: 'characterIds',
  });

  const {
    fields: aliases,
    append: appendAlias,
    remove: removeAlias,
    swap: swapAlias,
  } = useFieldArray({
    control,
    name: 'aliases',
  });

  const [lastGameId, setLastGameId] = useState<string | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(false);
  const [currentGameData, setCurrentGameData] = useState<GameSchema | null>(
    null
  );

  const handleSave = async ({
    id,
    name,
    category,
    subcategory,
    platforms,
    releaseDate,
    releaseDatePrecision,
    description,
    descriptionSourceName,
    descriptionSourceUrl,
    characterIds,
    characterSpoilerIds,
    soundtrackIds,
    hasCoverImage,
    hasBannerImage,
    coverImage,
    bannerImage,
    aliases,
    noLocalizations,
  }: Schema) => {
    if (!id) return;
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

      // upload images first to update hasCoverImage and hasBannerImage
      let newHasCoverImage = hasCoverImage;
      if (coverImage) {
        await uploadBytes(ref(storage, `game-covers/${id}`), coverImage);
        newHasCoverImage = true;
      }

      let newHasBannerImage = hasBannerImage;
      if (bannerImage) {
        await uploadBytes(ref(storage, `game-banners/${id}`), bannerImage);
        newHasBannerImage = true;
      }

      const batch = writeBatch(db);

      const formattedSoundtrackIds = soundtrackIds.map(({ value }) => value);
      const formattedCharacterIds = characterIds.map(({ value }) => value);

      let formattedReleaseDate = '';

      if (
        releaseDate &&
        ['day', 'month', 'year'].includes(releaseDatePrecision)
      ) {
        formattedReleaseDate = formatISO(
          new Date(releaseDate),
          releaseDatePrecision as 'day' | 'month' | 'year'
        );
      }

      const newData: GameSchema = {
        name,
        category,
        subcategory,
        platforms: platforms.map(({ value }) => value),
        releaseDate: formattedReleaseDate,
        description,
        descriptionSourceName,
        descriptionSourceUrl,
        characterIds: characterIds.map(({ value }) => value),
        characterSpoilerIds,
        soundtrackIds: formattedSoundtrackIds,
        updatedAt: serverTimestamp(),
        cachedSoundtracks: currentGameData?.cachedSoundtracks || {},
        cachedCharacters: currentGameData?.cachedCharacters || {},
        hasCoverImage: newHasCoverImage,
        hasBannerImage: newHasBannerImage,
        aliases: aliases.map(({ value }) => value),
        noLocalizations,
      };

      // update these if cache fields have changed
      if (
        currentGameData?.name !== name ||
        currentGameData?.category !== category ||
        currentGameData?.releaseDate !== formattedReleaseDate ||
        currentGameData?.hasCoverImage !== newHasCoverImage
      ) {
        const newCacheData = {
          name,
          category,
          releaseDate: formattedReleaseDate,
          hasCoverImage: newHasCoverImage,
        };

        // update all character docs that depend on this game
        currentGameData?.characterIds.forEach((characterId) => {
          batch.update(doc(charactersCollection, characterId), {
            [`cachedGames.${id}`]: newCacheData,
            updatedAt: serverTimestamp(),
          });
        });

        // update the games cache
        batch.update(doc(cacheCollection, 'games'), {
          [id]: newCacheData,
        });
      }

      // update dependentGameIds from music cache if the soundtrackIds have changed
      // 1. removed soundtracks
      const removedSoundtrackIds = currentGameData?.soundtrackIds.filter(
        (id) => !formattedSoundtrackIds.includes(id)
      );

      if (removedSoundtrackIds?.length) {
        removedSoundtrackIds.forEach((soundtrackId) => {
          batch.update(doc(musicCollection, soundtrackId), {
            dependentGameIds: arrayRemove(id),
            updatedAt: serverTimestamp(),
          });

          // remove the soundtrack from the game's cachedSoundtracks
          delete newData.cachedSoundtracks[soundtrackId];
        });
      }

      // 2. added soundtracks
      const addedSoundtrackIds = formattedSoundtrackIds.filter(
        (id) => !currentGameData?.soundtrackIds.includes(id)
      );

      if (addedSoundtrackIds.length) {
        addedSoundtrackIds.forEach((soundtrackId) => {
          batch.update(doc(musicCollection, soundtrackId), {
            dependentGameIds: arrayUnion(id),
            updatedAt: serverTimestamp(),
          });
        });

        // split the addedSoundtrackIds into chunks of 30
        // due to 'in' query limit
        const addedSoundtrackIdsChunks = addedSoundtrackIds.reduce(
          (acc, curr) => {
            const last = acc[acc.length - 1]!;
            if (last.length < 30) {
              last.push(curr);
            } else {
              acc.push([curr]);
            }
            return acc;
          },
          [[]] as string[][]
        );

        // add the soundtrack to the game's cachedSoundtracks
        const newMusicQuerySnap = await Promise.all(
          addedSoundtrackIdsChunks.map((chunk) =>
            getDocs(query(musicCollection, where(documentId(), 'in', chunk)))
          )
        );

        newMusicQuerySnap.forEach((snap) => {
          snap.forEach((doc) => {
            if (!doc.exists()) return;
            newData.cachedSoundtracks[doc.id] = doc.data();
          });
        });
      }

      // update gameId from character docs if the characterIds have changed
      // 1. removed characters
      const removedCharacterIds =
        currentGameData?.characterIds.filter(
          (id) => !formattedCharacterIds.includes(id)
        ) || [];

      if (removedCharacterIds.length) {
        removedCharacterIds.forEach((characterId) => {
          batch.update(doc(charactersCollection, characterId), {
            gameIds: arrayRemove(id),
            [`cachedGames.${id}`]: deleteField(),
            updatedAt: serverTimestamp(),
          });

          // remove the character from the game's cachedCharacters
          delete newData.cachedCharacters[characterId];
        });
      }

      // 2. added characters
      const newGameCacheData = {
        name,
        category,
        releaseDate: formattedReleaseDate,
        hasCoverImage: newHasCoverImage,
      };

      const addedCharacterIds = formattedCharacterIds.filter(
        (id) => !currentGameData?.characterIds.includes(id)
      );

      if (addedCharacterIds.length) {
        addedCharacterIds.forEach((characterId) => {
          batch.update(doc(charactersCollection, characterId), {
            gameIds: arrayUnion(id),
            [`cachedGames.${id}`]: newGameCacheData,
            updatedAt: serverTimestamp(),
          });

          // add the character to the game's cachedCharacters
          const foundCharacterCache = charactersCache[characterId];
          if (foundCharacterCache) {
            newData.cachedCharacters[characterId] = foundCharacterCache;
          }
        });
      }

      const isCacheDataChanged =
        currentGameData?.name !== name ||
        currentGameData?.category !== category ||
        currentGameData?.releaseDate !== formattedReleaseDate ||
        currentGameData?.hasCoverImage !== newHasCoverImage;

      if (isCacheDataChanged) {
        // 3. retained characters
        const retainedCharacterIds = formattedCharacterIds.filter((id) =>
          currentGameData?.characterIds.includes(id)
        );

        // update all character docs that depend on this game
        retainedCharacterIds.forEach((characterId) => {
          batch.update(doc(charactersCollection, characterId), {
            [`cachedGames.${id}`]: newGameCacheData,
            updatedAt: serverTimestamp(),
          });
        });

        // update the games cache
        batch.update(doc(cacheCollection, 'games'), {
          [id]: {
            name,
            category,
            releaseDate: formattedReleaseDate,
            hasCoverImage: newHasCoverImage,
          },
        });
      }

      // update the game doc
      // batch.update throws a type error
      batch.set(doc(gamesCollection, id), newData);

      await batch.commit();

      await revalidatePaths(
        [
          `/games/${id}`,
          ...(isCacheDataChanged || !!coverImage ? ['/games'] : []),
          ...((isCacheDataChanged || !!coverImage) &&
          ['Ys Series', 'Ys / Trails Series'].includes(category)
            ? ['/ys-series']
            : []),
          ...((isCacheDataChanged || !!coverImage) &&
          ['Trails Series', 'Ys / Trails Series'].includes(category)
            ? ['/trails-series']
            : []),
          ...((isCacheDataChanged || !!coverImage) &&
          category === 'Gagharv Trilogy'
            ? ['/gagharv-trilogy']
            : []),
          ...removedCharacterIds.map((id) => `/characters/${id}`),
          ...addedCharacterIds.map((id) => `/characters/${id}`),
        ],
        tokenRes.token
      );

      setCurrentGameData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          ...newData,
        };
      });

      // reset images after submit
      setValue('coverImage', null);
      setValue('bannerImage', null);
      setValue('hasCoverImage', newHasCoverImage);
      setValue('hasBannerImage', newHasBannerImage);

      enqueueSnackbar('Game updated successfully.', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar('Failed to update game.', { variant: 'error' });
      console.error(err);
    }
  };

  const changeGame = async (id: string) => {
    try {
      setIsLoadingGame(true);
      const gameSnap = await getDoc(doc(gamesCollection, id));
      const game = gameSnap.data();

      if (game) {
        const {
          updatedAt,
          cachedSoundtracks,
          platforms,
          characterIds,
          characterSpoilerIds,
          soundtrackIds,
          releaseDate,
          aliases,
          ...rest
        } = game;

        const releaseDatePrecision = (() => {
          // releaseDate is string here
          const releaseDateStr = releaseDate as string;

          switch (releaseDateStr.length) {
            case 4: // 2000
              return 'year';
            case 7: // 2000-01
              return 'month';
            case 10: // 2000-01-01
              return 'day';
            default:
              return 'unknown';
          }
        })();

        setCurrentGameData(game);
        reset({
          ...rest,
          id,
          releaseDate: releaseDate ? new Date(releaseDate) : null,
          releaseDatePrecision,
          platforms: platforms.map((value) => ({
            value,
          })),
          characterIds: characterIds.map((value) => ({
            value,
          })),
          characterSpoilerIds,
          soundtrackIds: soundtrackIds.map((value) => ({
            value,
          })),
          coverImage: null,
          bannerImage: null,
          aliases: aliases ? aliases.map((value) => ({ value })) : [],
          noLocalizations: !!game.noLocalizations,
        });
        setLastGameId(id);
      } else {
        setCurrentGameData({
          name: '',
          category: '',
          subcategory: '',
          platforms: [],
          releaseDate: null,
          description: '',
          descriptionSourceName: '',
          descriptionSourceUrl: '',
          characterIds: [],
          characterSpoilerIds: [],
          soundtrackIds: [],
          updatedAt: null,
          hasCoverImage: false,
          hasBannerImage: false,
          cachedSoundtracks: {},
          cachedCharacters: {},
          aliases: [],
          noLocalizations: false,
        });
        reset({
          id,
          name: '',
          category: '',
          subcategory: '',
          platforms: [],
          releaseDate: null,
          releaseDatePrecision: 'unknown',
          description: '',
          descriptionSourceName: '',
          descriptionSourceUrl: '',
          characterIds: [],
          characterSpoilerIds: [],
          soundtrackIds: [],
          hasCoverImage: false,
          hasBannerImage: false,
          coverImage: null,
          bannerImage: null,
          aliases: [],
          noLocalizations: false,
        });
        setLastGameId(id);
      }
    } catch (err) {
      enqueueSnackbar('Failed to fetch game data.', {
        variant: 'error',
      });
      setValue('id', lastGameId);
      console.error(err);
    } finally {
      setIsLoadingGame(false);
    }
  };

  const [soundtracksJson, setSoundtracksJson] = useState<string>('');
  const [isSoundtracksJsonValid, setIsSoundtracksJsonValid] = useState(true);

  return (
    <MainLayout title='Edit Game'>
      <GenericHeader title='Edit Game' gutterBottom />
      <FormContainer
        formContext={formContext}
        handleSubmit={handleSubmit(handleSave, (err) => console.error(err))}
      >
        <Paper sx={{ px: 3, py: 2, mb: 2 }}>
          <Typography variant='h2'>Selection</Typography>
          <AutocompleteElement
            name='id'
            label='Game'
            options={Object.entries(cachedGames).map(
              ([id, { name: label }]) => ({
                id,
                label,
              })
            )}
            loading={isLoadingCachedGames}
            autocompleteProps={{
              onChange: (_, v) => changeGame(v.id),
              fullWidth: true,
              disableClearable: true,
            }}
            textFieldProps={{
              margin: 'normal',
            }}
            required
            matchId
          />
        </Paper>
        {isLoadingGame && <CircularProgress />}
        {!!currentId && !isLoadingGame && (
          <>
            <Paper sx={{ px: 3, py: 2, mb: 2 }}>
              <Typography variant='h2'>General Info</Typography>
              <TextFieldElement
                name='name'
                label='Name'
                required
                fullWidth
                margin='normal'
              />
              <TextFieldElement
                name='category'
                label='Category'
                fullWidth
                margin='normal'
              />
              <TextFieldElement
                name='subcategory'
                label='Subcategory'
                fullWidth
                margin='normal'
              />
              <CheckboxElement
                name='noLocalizations'
                label='Game has no localizations'
              />
            </Paper>
            <Paper sx={{ px: 3, py: 2, mb: 2 }}>
              <Typography variant='h2'>Aliases</Typography>
              {aliases.map((role, idx) => (
                <Stack direction='row' spacing={2} key={role.id}>
                  <TextFieldElement
                    name={`aliases.${idx}.value`}
                    label={`Alias ${idx + 1}`}
                    fullWidth
                    margin='normal'
                    required
                  />
                  <Button
                    variant='outlined'
                    onClick={() => removeAlias(idx)}
                    sx={{ mt: '16px !important', height: 56 }}
                  >
                    Remove
                  </Button>
                  <Button
                    variant='outlined'
                    onClick={() => {
                      if (idx === 0) return;
                      swapAlias(idx, idx - 1);
                    }}
                    disabled={idx === 0}
                    sx={{ mt: '16px !important', height: 56 }}
                  >
                    Up
                  </Button>
                  <Button
                    variant='outlined'
                    onClick={() => {
                      if (idx === aliases.length - 1) return;
                      swapAlias(idx, idx + 1);
                    }}
                    disabled={idx === aliases.length - 1}
                    sx={{ mt: '16px !important', height: 56 }}
                  >
                    Down
                  </Button>
                </Stack>
              ))}
              <Button
                variant='outlined'
                onClick={() => appendAlias({ value: '' })}
                fullWidth
                sx={{ mt: 1 }}
              >
                Add Alias
              </Button>
            </Paper>
            <Paper sx={{ px: 3, py: 2, mb: 2 }}>
              <Typography variant='h2'>Release Date</Typography>
              <DatePickerElement
                name='releaseDate'
                label='Release Date'
                inputProps={{
                  fullWidth: true,
                  margin: 'normal',
                }}
                slotProps={{
                  actionBar: {
                    actions: ['clear'],
                  },
                }}
                helperText='For dates with less precision, fill in the rest with random values.'
              />
              <RadioButtonGroup
                name='releaseDatePrecision'
                label='Precision'
                options={[
                  { label: 'Year, month, and day', id: 'day' },
                  { label: 'Year and month only', id: 'month' },
                  { label: 'Year only', id: 'year' },
                  { label: 'Unknown date', id: 'unknown' },
                ]}
              />
            </Paper>
            <Paper sx={{ px: 3, py: 2, mb: 2 }}>
              <Typography variant='h2'>Description</Typography>
              <TextFieldElement
                name='description'
                label='Description'
                required
                fullWidth
                multiline
                minRows={3}
                margin='normal'
              />
              <TextFieldElement
                name='descriptionSourceName'
                label='Description Source Name'
                fullWidth
                margin='normal'
              />
              <TextFieldElement
                name='descriptionSourceUrl'
                label='Description Source URL'
                fullWidth
                margin='normal'
              />
            </Paper>
            <Paper sx={{ px: 3, py: 2, mb: 2 }}>
              <Typography variant='h2'>Platforms</Typography>
              {platforms.length === 0 && (
                <Typography color='warning.main'>
                  No platforms added yet.
                </Typography>
              )}
              {platforms.map((platformId, idx) => (
                <Stack direction='row' spacing={2} key={platformId.id}>
                  <AutocompleteElement
                    name={`platforms.${idx}.value`}
                    label={`Platform ${idx + 1}`}
                    options={Object.entries(GAME_PLATFORMS)
                      .map(([id, { name }]) => ({ id, label: name }))
                      .filter(
                        ({ id }) =>
                          // remove platform that are already added
                          !platforms.some((m) => m.value === id) ||
                          platformId.value === id
                      )}
                    autocompleteProps={{ fullWidth: true }}
                    textFieldProps={{ margin: 'normal' }}
                    matchId
                    required
                  />
                  <Button
                    variant='outlined'
                    onClick={() => removePlatform(idx)}
                    sx={{ mt: '16px !important', height: 56 }}
                  >
                    Remove
                  </Button>
                  <Button
                    variant='outlined'
                    onClick={() => {
                      if (idx === 0) return;
                      swapPlatform(idx, idx - 1);
                    }}
                    disabled={idx === 0}
                    sx={{ mt: '16px !important', height: 56 }}
                  >
                    Up
                  </Button>
                  <Button
                    variant='outlined'
                    onClick={() => {
                      if (idx === platforms.length - 1) return;
                      swapPlatform(idx, idx + 1);
                    }}
                    disabled={idx === platforms.length - 1}
                    sx={{ mt: '16px !important', height: 56 }}
                  >
                    Down
                  </Button>
                </Stack>
              ))}
              <Button
                variant='outlined'
                onClick={() => appendPlatform({ value: '' })}
                disabled={
                  platforms.length >= Object.keys(GAME_PLATFORMS).length
                }
                fullWidth
                sx={{ mt: 1 }}
              >
                Add Platform
              </Button>
            </Paper>
            <Paper sx={{ px: 3, py: 2, mb: 2 }}>
              <Typography variant='h2'>Characters</Typography>
              {characterIds.length === 0 && (
                <Typography color='warning.main'>
                  No characters added yet.
                </Typography>
              )}
              {characterIds.map((characterId, idx) => (
                <Stack direction='row' spacing={2} key={characterId.id}>
                  <AutocompleteElement
                    name={`characterIds.${idx}.value`}
                    label={`Character ${idx + 1}`}
                    options={Object.entries(charactersCache)
                      .map(([id, { name }]) => ({ id, label: name }))
                      .filter(
                        ({ id }) =>
                          // remove characters that are already added
                          !characterIds.some((m) => m.value === id) ||
                          characterId.value === id
                      )}
                    autocompleteProps={{ fullWidth: true }}
                    textFieldProps={{ margin: 'normal' }}
                    loading={isLoadingCharactersCache}
                    matchId
                    required
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={characterSpoilerIds.includes(
                          getValues(`characterIds.${idx}.value`)
                        )}
                        edge='start'
                        onChange={(e) => {
                          // useFieldArray's fields doesn't update immediately
                          const currentCharacterId = getValues(
                            `characterIds.${idx}.value`
                          );
                          if (!currentCharacterId) return;
                          const prevCharacterSpoilerIds = getValues(
                            'characterSpoilerIds'
                          );
                          if (e.target.checked) {
                            setValue('characterSpoilerIds', [
                              ...prevCharacterSpoilerIds,
                              currentCharacterId,
                            ]);
                          } else {
                            setValue(
                              'characterSpoilerIds',
                              prevCharacterSpoilerIds.filter(
                                (id) => id !== currentCharacterId
                              )
                            );
                          }
                        }}
                      />
                    }
                    label='Spoiler'
                    sx={{
                      mt: '16px !important',
                      height: 56,
                    }}
                  />
                  <Button
                    variant='outlined'
                    onClick={() => removeCharacter(idx)}
                    sx={{ mt: '16px !important', height: 56 }}
                  >
                    Remove
                  </Button>
                  <Button
                    variant='outlined'
                    onClick={() => {
                      if (idx === 0) return;
                      swapCharacter(idx, idx - 1);
                    }}
                    disabled={idx === 0}
                    sx={{ mt: '16px !important', height: 56 }}
                  >
                    Up
                  </Button>
                  <Button
                    variant='outlined'
                    onClick={() => {
                      if (idx === characterIds.length - 1) return;
                      swapCharacter(idx, idx + 1);
                    }}
                    disabled={idx === characterIds.length - 1}
                    sx={{ mt: '16px !important', height: 56 }}
                  >
                    Down
                  </Button>
                </Stack>
              ))}
              <Button
                variant='outlined'
                onClick={() => appendCharacter({ value: '' })}
                disabled={
                  isLoadingMusicCache ||
                  characterIds.length >= Object.keys(charactersCache).length
                }
                fullWidth
                sx={{ mt: 1 }}
              >
                Add Character
              </Button>
            </Paper>
            <Paper sx={{ px: 3, py: 2, mb: 2 }}>
              <Typography variant='h2'>Cover Image</Typography>
              <Typography color='text.secondary'>
                Accepted file type: .webp
              </Typography>
              <Typography color='text.secondary'>Max size: 5MB.</Typography>
              <Typography color='text.secondary'>
                Max dimensions: 500x500.
              </Typography>
              <Typography color='text.secondary' sx={{ mb: 2 }}>
                Note that cover images are cropped to 2:3 aspect ratio.
              </Typography>
              {/* display cover image if hasCoverImage is true */}
              {hasCoverImage ? (
                <Box
                  className='default-bg'
                  sx={{
                    mb: 2,
                    p: 1.5,
                    borderRadius: 2,
                  }}
                >
                  <Typography color='text.secondary' sx={{ mb: 1 }}>
                    Current cover image (cropped):
                  </Typography>
                  <Box
                    component='img'
                    src={`${CLOUD_STORAGE_URL}/game-covers/${currentId}`}
                    alt='current cover image'
                    sx={{
                      width: '100%',
                      maxWidth: 180,
                      aspectRatio: '2 / 3',
                      objectFit: 'cover',
                    }}
                  />
                </Box>
              ) : (
                <Typography color='text.secondary' sx={{ mb: 2 }}>
                  No cover image uploaded yet.
                </Typography>
              )}
              <Box>
                <Box>
                  <Box display='inline-block'>
                    <input
                      style={{ display: 'none' }}
                      id='coverImage'
                      type='file'
                      accept='image/webp'
                      {...register('coverImage', {
                        onChange: (e: ChangeEvent<HTMLInputElement>) => {
                          if (e.target.files?.[0]?.type === 'image/webp') {
                            setValue('coverImage', e.target.files[0]);
                          } else {
                            setValue('coverImage', null);
                            enqueueSnackbar(
                              'Invalid file type. Only .webp is accepted.',
                              { variant: 'error' }
                            );
                          }
                          trigger('coverImage');
                        },
                      })}
                    />
                    <label htmlFor='coverImage'>
                      <Button
                        variant='contained'
                        color={errors.coverImage ? 'error' : 'primary'}
                        component='span'
                      >
                        {hasCoverImage || !!coverImage
                          ? 'Replace Cover Image'
                          : 'Upload Cover Image'}
                      </Button>
                    </label>
                  </Box>
                  {coverImage && (
                    <Button
                      variant='outlined'
                      onClick={() =>
                        setValue('coverImage', null, {
                          shouldValidate: true,
                        })
                      }
                      sx={{ ml: 2 }}
                    >
                      Remove Selected Cover Image
                    </Button>
                  )}
                </Box>
                {/* display selected image */}
                {coverImage && (
                  <Box sx={{ mt: 2 }}>
                    {errors.coverImage && (
                      <Typography color='error.main' sx={{ mb: 2 }}>
                        {errors.coverImage.message}
                      </Typography>
                    )}
                    <Box
                      className='default-bg'
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                      }}
                    >
                      <Typography color='text.secondary' sx={{ mb: 1 }}>
                        Selected cover image (cropped):
                      </Typography>
                      <Box
                        component='img'
                        src={URL.createObjectURL(coverImage)}
                        alt='selected cover image'
                        sx={{
                          width: '100%',
                          maxWidth: 180,
                          aspectRatio: '2 / 3',
                          objectFit: 'cover',
                        }}
                      />
                    </Box>
                  </Box>
                )}
              </Box>
            </Paper>
            <Paper sx={{ px: 3, py: 2, mb: 2 }}>
              <Typography variant='h2'>Banner Image</Typography>
              <Typography color='text.secondary'>
                Accepted file type: .webp
              </Typography>
              <Typography color='text.secondary'>Max size: 5MB.</Typography>
              <Typography color='text.secondary'>
                Max dimensions: 2000x2000.
              </Typography>
              <Typography color='text.secondary' sx={{ mb: 2 }}>
                Note that banner images are cropped to 100% width to 120-200px
                height ratio.
              </Typography>
              {/* display banner image if hasBannerImage is true */}
              {hasBannerImage ? (
                <Box
                  className='default-bg'
                  sx={{
                    mb: 2,
                    p: 1.5,
                    borderRadius: 2,
                  }}
                >
                  <Typography color='text.secondary' sx={{ mb: 1 }}>
                    Current banner image (cropped):
                  </Typography>
                  <Box
                    component='img'
                    src={`${CLOUD_STORAGE_URL}/game-banners/${currentId}`}
                    alt='current banner image'
                    sx={{
                      width: '100%',
                      height: {
                        xs: 120,
                        sm: 160,
                        md: 200,
                      },
                      objectFit: 'cover',
                    }}
                  />
                </Box>
              ) : (
                <Typography color='text.secondary' sx={{ mb: 2 }}>
                  No banner image uploaded yet.
                </Typography>
              )}
              <Box>
                <Box>
                  <Box display='inline-block'>
                    <input
                      style={{ display: 'none' }}
                      id='bannerImage'
                      type='file'
                      accept='image/webp'
                      {...register('bannerImage', {
                        onChange: (e: ChangeEvent<HTMLInputElement>) => {
                          if (e.target.files?.[0]?.type === 'image/webp') {
                            setValue('bannerImage', e.target.files[0]);
                          } else {
                            setValue('bannerImage', null);
                            enqueueSnackbar(
                              'Invalid file type. Only .webp is accepted.',
                              { variant: 'error' }
                            );
                          }
                          trigger('bannerImage');
                        },
                      })}
                    />
                    <label htmlFor='bannerImage'>
                      <Button
                        variant='contained'
                        color={errors.bannerImage ? 'error' : 'primary'}
                        component='span'
                      >
                        {hasBannerImage || !!bannerImage
                          ? 'Replace Banner Image'
                          : 'Upload Banner Image'}
                      </Button>
                    </label>
                  </Box>
                  {bannerImage && (
                    <Button
                      variant='outlined'
                      onClick={() =>
                        setValue('bannerImage', null, {
                          shouldValidate: true,
                        })
                      }
                      sx={{ ml: 2 }}
                    >
                      Remove Selected Banner Image
                    </Button>
                  )}
                </Box>
                {/* display selected image */}
                {bannerImage && (
                  <Box sx={{ mt: 2 }}>
                    {errors.bannerImage && (
                      <Typography color='error.main' sx={{ mb: 2 }}>
                        {errors.bannerImage.message}
                      </Typography>
                    )}
                    <Box
                      className='default-bg'
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                      }}
                    >
                      <Typography color='text.secondary' sx={{ mb: 1 }}>
                        Selected banner image (cropped):
                      </Typography>
                      <Box
                        component='img'
                        src={URL.createObjectURL(bannerImage)}
                        alt='selected banner image'
                        sx={{
                          width: '100%',
                          height: {
                            xs: 120,
                            sm: 160,
                            md: 200,
                          },
                          objectFit: 'cover',
                        }}
                      />
                    </Box>
                  </Box>
                )}
              </Box>
            </Paper>
            <Paper sx={{ px: 3, py: 2, mb: 2 }}>
              <Typography variant='h2'>Soundtracks</Typography>
              {soundtrackIds.length === 0 && (
                <Typography color='warning.main'>
                  No soundtracks added yet.
                </Typography>
              )}
              {soundtrackIds.map((soundtrackId, idx) => (
                <Stack direction='row' spacing={2} key={soundtrackId.id}>
                  <AutocompleteElement
                    name={`soundtrackIds.${idx}.value`}
                    label={`Soundtrack ${idx + 1}`}
                    options={Object.entries(musicCache)
                      .map(([id, { title, albumId }]) => {
                        const foundAlbum = cachedMusicAlbums[albumId];

                        const albumName =
                          albumId === ''
                            ? 'No album'
                            : foundAlbum?.name || 'Unknown album';

                        return {
                          id,
                          label: `${title} (${albumName})`,
                        };
                      })
                      .filter(
                        ({ id }) =>
                          // remove music that are already added
                          !soundtrackIds.some((m) => m.value === id) ||
                          soundtrackId.value === id
                      )}
                    autocompleteProps={{ fullWidth: true }}
                    textFieldProps={{ margin: 'normal' }}
                    loading={isLoadingMusicCache || isCachedLoadingMusicAlbums}
                    matchId
                    required
                  />
                  <Button
                    variant='outlined'
                    onClick={() => removeSoundtrack(idx)}
                    sx={{ mt: '16px !important', height: 56 }}
                  >
                    Remove
                  </Button>
                  <Button
                    variant='outlined'
                    onClick={() => {
                      if (idx === 0) return;
                      swapSoundtrack(idx, idx - 1);
                    }}
                    disabled={idx === 0}
                    sx={{ mt: '16px !important', height: 56 }}
                  >
                    Up
                  </Button>
                  <Button
                    variant='outlined'
                    onClick={() => {
                      if (idx === soundtrackIds.length - 1) return;
                      swapSoundtrack(idx, idx + 1);
                    }}
                    disabled={idx === soundtrackIds.length - 1}
                    sx={{ mt: '16px !important', height: 56 }}
                  >
                    Down
                  </Button>
                </Stack>
              ))}
              <Button
                variant='outlined'
                onClick={() => appendSoundtrack({ value: '' })}
                disabled={
                  isLoadingMusicCache ||
                  soundtrackIds.length >= Object.keys(musicCache).length
                }
                fullWidth
                sx={{ mt: 1 }}
              >
                Add Soundtrack
              </Button>
            </Paper>
            <Paper sx={{ px: 3, py: 2, mb: 2 }}>
              <Typography variant='h2'>Override Soundtracks</Typography>
              <Typography>
                This is used for adding or replacing soundtracks in bulk. The
                field takes a JSON array of strings containing music IDs.
              </Typography>
              <MuiTextField
                label='Paste JSON here'
                fullWidth
                margin='normal'
                value={soundtracksJson}
                onChange={(e) => {
                  setSoundtracksJson(e.target.value);
                  if (e.target.value === '') setIsSoundtracksJsonValid(true);
                }}
                error={!isSoundtracksJsonValid}
                helperText={!isSoundtracksJsonValid ? 'Invalid JSON Array' : ''}
              />
              <Button
                fullWidth
                sx={{ mt: 1 }}
                onClick={() => {
                  try {
                    const parsedJson = JSON.parse(soundtracksJson);
                    if (!Array.isArray(parsedJson)) {
                      setIsSoundtracksJsonValid(false);
                      return;
                    }
                    setIsSoundtracksJsonValid(true);
                    setValue(
                      'soundtrackIds',
                      parsedJson.map((value) => ({
                        value,
                      }))
                    );
                    setSoundtracksJson('');
                  } catch (err) {
                    setIsSoundtracksJsonValid(false);
                  }
                }}
              >
                Apply Soundtrack Overrides
              </Button>
            </Paper>
            {(!!coverImage || !!bannerImage) && (
              <Alert severity='warning' sx={{ mb: 2 }}>
                Please be advised that replaced images will take up at most 60
                minutes to reflect on the page. This is due to Google Cloud
                Storage object caching.
              </Alert>
            )}
            <LoadingButton
              type='submit'
              variant='contained'
              disabled={isLoadingGame}
              loading={isSubmitting}
              fullWidth
            >
              Submit
            </LoadingButton>
          </>
        )}
      </FormContainer>
    </MainLayout>
  );
};

export default EditGame;
