import * as React from 'react';
import Box from '@mui/material/Box';
import OutlinedInput from '@mui/material/OutlinedInput';
import InputLabel from '@mui/material/InputLabel';
import InputAdornment from '@mui/material/InputAdornment';
import FormControl from '@mui/material/FormControl';
import SearchIcon from '@mui/icons-material/Search';

export default function InputAdornments() {
  const outlinedAmountId = React.useId();

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', bgcolor: 'primary' }}>
      <div>
        <FormControl fullWidth sx={{ m: 1 }}>
          <InputLabel htmlFor={`${outlinedAmountId}-input`}>Search</InputLabel>
          <OutlinedInput
            id={`${outlinedAmountId}-input`}
            startAdornment={<InputAdornment position="start"><SearchIcon/></InputAdornment>}
            label="Search"
          />
        </FormControl>
      </div>
    </Box>
  );
}
