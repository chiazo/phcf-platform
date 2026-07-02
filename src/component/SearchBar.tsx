import * as React from 'react';
import Box from '@mui/material/Box';
import OutlinedInput from '@mui/material/OutlinedInput';
import InputLabel from '@mui/material/InputLabel';
import InputAdornment from '@mui/material/InputAdornment';
import FormControl from '@mui/material/FormControl';
import SearchIcon from '@mui/icons-material/Search';
import Table from './AdminMemberTableView';

// async function getMembersFromSearch(){
//   console.log
// }



export default function InputAdornments()  {
  const [searchedMembers, setSearchedMembers] = React.useState("")
  const [currSearchedMem, setCurrSearchedMem] = React.useState("")
  const [text, setText] = React.useState<string>()
  const outlinedAmountId = React.useId();

  React.useEffect(()=>{
   
  },[currSearchedMem])

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', bgcolor: 'primary' }}>
      <div>
        <FormControl fullWidth sx={{ m: 1 }}>
          <InputLabel htmlFor={`${outlinedAmountId}-input`}>Search</InputLabel>
          <OutlinedInput
            id={`${outlinedAmountId}-input`}
            startAdornment={<InputAdornment position="start"><SearchIcon/></InputAdornment>}
            label="Search"
            onKeyDown={ (e) => {if (e.code === "Enter"){setCurrSearchedMem(text!)}}}
            onChange={(e)=> {setText((e.target.value))}}
          />
        </FormControl>
      </div>
      <Table members = {searchedMembers}/>
    </Box>
  );
}

