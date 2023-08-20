import { Box, Divider, Stack } from '@mui/material';

import { editorPagesItems } from '~/constants';

import NavMenuList from './NavMenuList';

const EditorPagesMenu = () => {
  return (
    <Stack
      direction='row'
      spacing={2}
      divider={<Divider orientation='vertical' flexItem light />}
      sx={{ mt: -1.5, mx: -1 }}
    >
      {editorPagesItems.map((subcategory) => (
        <Box key={subcategory.name} sx={{ width: 140 }}>
          <NavMenuList labelPrefix='explore-menu' subcategory={subcategory} />
        </Box>
      ))}
    </Stack>
  );
};

export default EditorPagesMenu;
