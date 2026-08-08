import * as React from 'react';
import { Link } from "react-router-dom";
import { alpha } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import RuleIcon from '@mui/icons-material/Rule';
import DeleteIcon from '@mui/icons-material/Delete';
import MoodRoundedIcon from '@mui/icons-material/MoodRounded';
import SentimentDissatisfiedRoundedIcon from '@mui/icons-material/SentimentDissatisfiedRounded';
import FormControlLabel from '@mui/material/FormControlLabel';
import { visuallyHidden } from '@mui/utils';
import { useState } from "react";

import {listApprovalUpdates} from "../lib/pocketbase";


interface Data {
  id: string;
  fullName: string;
  allMemberRequirementsMet: string;
  dueStatus: string; //DueState
  duesStatusMet: string;
  amountPaid: number; //Amount Paid
  meetingsRequired: number; //Meetings Required
  meetingsCompleted: number;
  meetingsRequiredMet: string;
  serviceHoursRequired: number; //hours completed
  serviceHoursCompleted:number; //hours completed
  serviceHoursMet: string;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function yesNo(value: boolean): string {
  return value ? 'YES' : 'NO';
}

// Raw PocketBase member_snapshot records (see MemberSnapshotDTO) are nested
// and snake_case; flatten them into the shape the table sorts/renders on.
function toRow(member: Record<string, any>): Data {
  const personalInfo = member.personal_info ?? {};
  const memberInfo = member.member_info ?? {};
  const dues = memberInfo.dues ?? {};
  const requirements = memberInfo.requirements ?? {};
  const firstName = personalInfo.firstName ?? ''
  const lastName = personalInfo.lastName ?? ''
  const fullName = firstName + ' ' + lastName
  const serviceRequirements = requirements.serviceRequirements ?? [];
  const dueStatus = dues.dueState ?? '';
  const meetingsRequired = toNumber(requirements.meetingsRequired);
  const meetingsCompleted = toNumber(requirements.meetingsCompleted);
  const serviceHoursRequired = toNumber(requirements.serviceHoursRequired);
  const serviceHoursCompleted = serviceRequirements.reduce(
    (sum: number, s: any) => sum + toNumber(s.hoursCompleted),
    0,
  );
  const duesPaid = dueStatus === 'PAID' || dueStatus === 'COMPLETE';
  const meetingsMet = meetingsCompleted >= meetingsRequired;
  const serviceHoursMet = serviceHoursCompleted >= serviceHoursRequired;
  const allMemberRequirementsMet =
    duesPaid && meetingsMet && serviceHoursMet;
  

  return createData(
    member.id,
    fullName,
    yesNo(allMemberRequirementsMet),
    dueStatus,
    yesNo(duesPaid),
    toNumber(dues.amountPaid),
    meetingsRequired,
    meetingsCompleted,
    yesNo(meetingsMet),
    serviceHoursRequired,
    serviceHoursCompleted,
    yesNo(serviceHoursMet),
  );
}

function createData(
  id: string,
  fullName: string,
  allMemberRequirementsMet: string,
  dueStatus: string, //DueState
  duesStatusMet: string,
  amountPaid: number, //Amount Paid
  meetingsRequired: number, //Meetings Required
  meetingsCompleted: number,
  meetingsRequiredMet: string,
  serviceHoursRequired: number, //hours completed
  serviceHoursCompleted:number,
  serviceHoursMet: string,
): Data {
  return {
     id,
    fullName,
    allMemberRequirementsMet,
    dueStatus, //DueState
    duesStatusMet,
    amountPaid, //Amount Paid
    meetingsRequired, //Meetings Required
    meetingsCompleted,
    meetingsRequiredMet,
    serviceHoursRequired, //hours completed
    serviceHoursCompleted,
    serviceHoursMet,
  };
}


function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
  if (b[orderBy] < a[orderBy]) {
    return -1;
  }
  if (b[orderBy] > a[orderBy]) {
    return 1;
  }
  return 0;
}

type Order = 'asc' | 'desc';
type RequirementFilter =
  | 'serviceHoursMet'
  | 'meetingsRequiredMet'
  | 'duesStatusMet'
  | 'allMemberRequirementsMet';

const requirementFilters: Array<{
  id: RequirementFilter;
  label: string;
}> = [
  { id: 'serviceHoursMet', label: 'Service hours met' },
  { id: 'meetingsRequiredMet', label: 'Meetings required met' },
  { id: 'duesStatusMet', label: 'Dues status met' },
  { id: 'allMemberRequirementsMet', label: 'All requirements met' },
];

function getComparator<Key extends keyof any>(
  order: Order,
  orderBy: Key,
): (
  a: { [key in Key]: number | string },
  b: { [key in Key]: number | string },
) => number {
  return order === 'desc'
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}

interface HeadCell {
  disablePadding: boolean;
  id: keyof Data;
  label: string;
  numeric: boolean;
}

const headCells: readonly HeadCell[] = [
  {
    id: 'fullName',
    numeric: false,
    disablePadding: true,
    label: 'Full Name',
  },
  {
    id: 'allMemberRequirementsMet',
    numeric: false,
    disablePadding: false,
    label: 'All Member Requirements Met',
  },
  {
    id: 'dueStatus',
    numeric: true,
    disablePadding: false,
    label: 'Current Dues Status',
  },
  {
    id: 'amountPaid',
    numeric: true,
    disablePadding: false,
    label: 'Amount Paid',
  },
  {
    id: 'meetingsRequired',
    numeric: true,
    disablePadding: false,
    label: 'Meetings Required',
  },
  {
    id: 'meetingsCompleted',
    numeric: true,
    disablePadding: false,
    label: 'Meetings Completed',
  },
];

interface EnhancedTableProps {
  numSelected: number;
  onRequestSort: (event: React.MouseEvent<unknown>, property: keyof Data) => void;
  onSelectAllClick: (event: React.ChangeEvent<HTMLInputElement>) => void;
  order: Order;
  orderBy: string;
  rowCount: number;
}

function EnhancedTableHead(props: EnhancedTableProps) {
  const { onSelectAllClick, order, orderBy, numSelected, rowCount, onRequestSort } =
    props;
  const createSortHandler =
    (property: keyof Data) => (event: React.MouseEvent<unknown>) => {
      onRequestSort(event, property);
    };

  return (
    <TableHead>
      <TableRow>
        <TableCell padding="checkbox">
          <Checkbox
            color="primary"
            indeterminate={numSelected > 0 && numSelected < rowCount}
            checked={rowCount > 0 && numSelected === rowCount}
            onChange={onSelectAllClick}
            slotProps={{
              input: { 'aria-label': 'select all desserts' },
            }}
          />
        </TableCell>
        {headCells.map((headCell) => (
          <TableCell
            key={headCell.id}
            align={headCell.numeric ? 'right' : 'left'}
            padding={headCell.disablePadding ? 'none' : 'normal'}
            sortDirection={orderBy === headCell.id ? order : false}
          >
            <TableSortLabel
              active={orderBy === headCell.id}
              direction={orderBy === headCell.id ? order : 'asc'}
              onClick={createSortHandler(headCell.id)}
            >
              {headCell.label}
              {orderBy === headCell.id ? (
                <Box component="span" sx={visuallyHidden}>
                  {order === 'desc' ? 'sorted descending' : 'sorted ascending'}
                </Box>
              ) : null}
            </TableSortLabel>
          </TableCell>
        ))}
        <TableCell align="center">Work Hours Required</TableCell>
        <TableCell align="center">Work Hours Completed</TableCell>
        <TableCell align="center">Open Hours Required</TableCell>
        <TableCell align="center">Open Hours Completed</TableCell>
        <TableCell align="center">Status</TableCell>
      </TableRow>
    </TableHead>
  );
}
interface EnhancedTableToolbarProps {
  numSelected: number;
}

function EnhancedTableToolbar(props: EnhancedTableToolbarProps) {
  const { numSelected } = props;
  const [allMembers, setAllMembers] = useState<Array<Record<string, any>>>([]);

  function displayModal(){
    const modal = document.getElementById("myModal");
    
    if (modal){
       modal.style.display = "block";
    }
  }

  return (
    <Toolbar
      sx={[
        {
          pl: { sm: 2 },
          pr: { xs: 1, sm: 1 },
        },
        numSelected > 0 && {
          bgcolor: (theme) =>
            alpha(theme.palette.primary.main, theme.palette.action.activatedOpacity),
        },
      ]}
    >
      {numSelected > 0 ? (
        <Typography
          variant="subtitle1"
          component="div"
          sx={{
            color: 'inherit',
            flex: '1 1 100%',
          }}
        >
          {numSelected} selected
        </Typography>
      ) : (
        <Typography
          sx={{ flex: '1 1 100%' }}
          variant="h6"
          id="tableTitle"
          component="div"
        >
          Prospect Heights Community Farm Members
        </Typography>
      )}
      {numSelected > 0 ? (
        <Tooltip title="Delete">
          <IconButton>
            <DeleteIcon />
          </IconButton>
        </Tooltip>
      ) : (
        <Tooltip title="Needs Admin Approval List" onClick={displayModal}>
          <IconButton >
            <RuleIcon fontSize={'large'} sx={{ color: 'green' }} />
          </IconButton>
        </Tooltip>
      )}
    </Toolbar>
  );
}
export default function EnhancedTable({ members, work_formulas }: { members: Array<Record<string, any>>, work_formulas: Array<Record<string, any> | null> } ) {
  const [order, setOrder] = React.useState<Order>('asc');
  const [orderBy, setOrderBy] = React.useState<keyof Data>('dueStatus');
  const [selected, setSelected] = React.useState<readonly string[]>([]);
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(5);
  const [activeFilters, setActiveFilters] = React.useState<RequirementFilter[]>([]);


  const handleRequestSort = (
    event: React.MouseEvent<unknown>,
    property: keyof Data,
  ) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const allRows = React.useMemo(() => members.map(toRow), [members]);

  const filteredRows = React.useMemo(
    () =>
      allRows.filter((row) =>
        activeFilters.every((filterId) => row[filterId] === 'YES'),
      ),
    [activeFilters, allRows],
  );

  const handleFilterChange =
    (filterId: RequirementFilter) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setActiveFilters((current) =>
        event.target.checked
          ? [...current, filterId]
          : current.filter((id) => id !== filterId),
      );
      setPage(0);
    };

  const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const newSelected = filteredRows.map((n) => n.id);
      setSelected(newSelected);
      return;
    }
    setSelected([]);
  };

  const handleClick = (event: React.MouseEvent<unknown>, id: string) => {
    const selectedIndex = selected.indexOf(id);
    let newSelected: readonly string[] = [];

    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selected, id);
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selected.slice(1));
    } else if (selectedIndex === selected.length - 1) {
      newSelected = newSelected.concat(selected.slice(0, -1));
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(
        selected.slice(0, selectedIndex),
        selected.slice(selectedIndex + 1),
      );
    }
    setSelected(newSelected);
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Avoid a layout jump when reaching the last page with empty rows.
  const emptyRows =
    page > 0 ? Math.max(0, (1 + page) * rowsPerPage - filteredRows.length) : 0;

  const visibleRows = React.useMemo(
    () =>
      [...filteredRows]
        .sort(getComparator(order, orderBy))
        .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [filteredRows, order, orderBy, page, rowsPerPage],
  );

  return (
    <React.Fragment>
      <Box sx={{ width: '100%' }}>
        <Paper sx={{ width: '100%', mb: 2 }}>
          <EnhancedTableToolbar numSelected={selected.length} />
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
              px: 2,
              py: 1,
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            <Typography
              component="span"
              sx={{ alignSelf: 'center', fontWeight: 600, mr: 1 }}
            >
              Filters:
            </Typography>
            {requirementFilters.map((filter) => (
              <FormControlLabel
                key={filter.id}
                control={
                  <Checkbox
                    checked={activeFilters.includes(filter.id)}
                    onChange={handleFilterChange(filter.id)}
                    size="small"
                  />
                }
                label={filter.label}
              />
            ))}
          </Box>
          <TableContainer>
            <Table
              sx={{ minWidth: 750 }}
              aria-labelledby="tableTitle"
              size="medium"
            >
              <EnhancedTableHead
                numSelected={selected.length}
                order={order}
                orderBy={orderBy}
                onSelectAllClick={handleSelectAllClick}
                onRequestSort={handleRequestSort}
                rowCount={filteredRows.length}
              />
              <TableBody>
                {visibleRows.map((row, index) => {
                  const isItemSelected = selected.includes(row.id);
                  const labelId = `enhanced-table-checkbox-${index}`;
                  const workFormula = work_formulas[index];
                  const workHoursRequired = workFormula?.work_hours_required ?? 0;
                  const workHoursCompleted = workFormula?.work_hours_completed ?? 0;
                  const openHoursRequired = workFormula?.open_hours_required ?? 0;
                  const openHoursCompleted = workFormula?.open_hours_completed ?? 0;
                  const isWorkFormulaSatisfied =
                    workHoursRequired === workHoursCompleted &&
                    openHoursRequired === openHoursCompleted;

                  return (
                    <TableRow
                      hover
                      onClick={(event) => handleClick(event, row.id)}
                      role="checkbox"
                      aria-checked={isItemSelected}
                      tabIndex={-1}
                      key={row.id}
                      selected={isItemSelected}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          color="primary"
                          checked={isItemSelected}
                          slotProps={{
                            input: { 'aria-labelledby': labelId },
                          }}
                        />
                      </TableCell>
                      <TableCell
                        component="th"
                        id={labelId}
                        scope="row"
                        padding="none"
                      >
                        <Link to={`/snapshot/${row.id}`}>
                          {row.fullName}
                          </Link>
                      </TableCell>
                      <TableCell align="center">{row.allMemberRequirementsMet}</TableCell>
                      <TableCell align="center">{row.dueStatus}</TableCell>
                      <TableCell align="center">{row.amountPaid}</TableCell>
                      <TableCell align="center">{row.meetingsRequired}</TableCell>
                      <TableCell align="center">{row.meetingsCompleted}</TableCell>
                      <TableCell align="center">{workHoursRequired}</TableCell>
                      <TableCell align="center">{workHoursCompleted}</TableCell>
                      <TableCell align="center">{openHoursRequired}</TableCell>
                      <TableCell align="center">{openHoursCompleted}</TableCell>
                      <TableCell align="center">
                        {workFormula ? (
                          isWorkFormulaSatisfied ? (
                            <MoodRoundedIcon sx={{ color: 'green' }} />
                          ) : (
                            <SentimentDissatisfiedRoundedIcon sx={{ color: 'red' }} />
                          )
                        ) : (
                          'N/A'
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {emptyRows > 0 && (
                  <TableRow
                    style={{
                      height: 53 * emptyRows,
                    }}
                  >
                    <TableCell colSpan={11} />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[5, 10, 25]}
            component="div"
            count={filteredRows.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </Paper>
    </Box>

    </React.Fragment>
  );
}
