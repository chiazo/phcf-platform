import { useEffect, useMemo, useState, useId } from "react";
import { Link } from "react-router-dom";

import { listMemberSnapshots } from "../lib/pocketbase";
import { config } from "../lib/config";

import Box from '@mui/material/Box';
import OutlinedInput from '@mui/material/OutlinedInput';
import InputLabel from '@mui/material/InputLabel';
import InputAdornment from '@mui/material/InputAdornment';
import FormControl from '@mui/material/FormControl';
import SearchIcon from '@mui/icons-material/Search';

import MemberTable from "../components/MemberTable";

export default function MembersPage() {
  //holds all of the members fetched from the server
  const [allMembers, setAllMembers] = useState<Array<Record<string, any>>>([]);
  const [query, setQuery] = useState("");
  const outlinedAmountId = useId();

  //listMemberSnapshots is a GET Request
  //gives back at least 1 member and at most 50 members
  useEffect(() => {
    document.title = "Overview";

    listMemberSnapshots()
      .then((res) => setAllMembers(res.items))
      .catch((err) => {
        console.error("member fetch error:", err);
        setAllMembers([]);
      });
  }, []);

  //filters the already-loaded members as the user types, so the table
  //updates immediately without waiting on a network request
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allMembers;

    return allMembers.filter((record) => {
      const firstName = record.personal_info?.firstName?.toLowerCase() ?? "";
      const lastName = record.personal_info?.lastName?.toLowerCase() ?? "";
      return firstName.includes(q) || lastName.includes(q);
    });
  }, [allMembers, query]);

  return (
    <>
      <h1>Members</h1>

       <Box sx={{ display: 'flex', flexWrap: 'wrap', bgcolor: 'primary' }}>
      <div>
        <FormControl fullWidth sx={{ m: 1 }}>
          <InputLabel htmlFor={`${outlinedAmountId}-input`}>Search</InputLabel>
          <OutlinedInput
            id={`${outlinedAmountId}-input`}
            startAdornment={<InputAdornment position="start"><SearchIcon/></InputAdornment>}
            label="Search"
            onChange={(e) => setQuery(e.target.value)}
          />
        </FormControl>
      </div>
    </Box>

      <MemberTable members={items}/>

      {/* <ul>
        {items.map((record) => (
          <li key={record.id}>
            <Link to={`/snapshot/${record.id}`}>
              {record.personal_info?.firstName} {record.personal_info?.lastName}
            </Link>
          </li>
        ))}
      </ul> */}
      <br />

      <a
        className="fab"
        href={`${config.pbUrl}/_/`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open DB View →
      </a>
    </>
  );
}
