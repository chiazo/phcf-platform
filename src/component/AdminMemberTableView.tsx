import * as React from 'react';
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
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import DeleteIcon from '@mui/icons-material/Delete';
import FilterListIcon from '@mui/icons-material/FilterList';
import { visuallyHidden } from '@mui/utils';

interface Data {
  id: number; 
  firstName: string; 
  lastName: string;
  dueStatus: string; //DueState
  amountPaid: number; //Amount Paid
  meetingsRequired: number; //Meetings Required
  meetingsCompleted: number;
  openHoursRequired: number; //work or open hours
  openHoursCompleted: number; //work or open hours
  serviceHoursRequired: number; //hours completed
  serviceHoursCompleted:number; //hours completed
}

function createData(
  id: number,
  firstName: string,
  lastName: string, 
  dueStatus: string, //DueState
  amountPaid: number, //Amount Paid
  meetingsRequired: number, //Meetings Required
  meetingsCompleted: number,
  openHoursRequired: number, //work or open hours
  openHoursCompleted: number, //work or open hours
  serviceHoursRequired: number, //hours completed
  serviceHoursCompleted:number
): Data {
  return {
    id,
    firstName,
    lastName, 
    dueStatus, //DueState
    amountPaid, //Amount Paid
    meetingsRequired, //Meetings Required
    meetingsCompleted,
    openHoursRequired, //work or open hours
    openHoursCompleted, //work or open hours
    serviceHoursRequired, //hours completed
    serviceHoursCompleted
  };
}

const dummyData = [
  { "id": 1, 
    "firstName": "User", 
    "lastName": "Buser", 
    "dueStatus": 'Incomplete', 
    "amountPaid": 1, 
    "meetingsRequired": 2, 
    "meetingsCompleted": 3, 
    "openHoursRequired": 4, 
    "openHoursCompleted": 5,
    "serviceHoursRequired": 6,
    "serviceHoursCompleted": 7
  },
  { "id": 2, 
    "firstName": "User", 
    "lastName": "Buser", 
    "dueStatus": 'Incomplete', 
    "amountPaid": 8, 
    "meetingsRequired": 9, 
    "meetingsCompleted": 10, 
    "openHoursRequired": 11, 
    "openHoursCompleted": 12,
    "serviceHoursRequired": 13,
    "serviceHoursCompleted": 14
  },
]


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
    id: 'firstName',
    numeric: false,
    disablePadding: true,
    label: 'First Name',
  },
  {
    id: 'lastName',
    numeric: false,
    disablePadding: true,
    label: 'Last Name',
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
  {
    id: 'openHoursRequired',
    numeric: false,
    disablePadding: false,
    label: 'Open Hours Required',
  },
   {
    id: 'openHoursCompleted',
    numeric: false,
    disablePadding: false,
    label: 'Open Hours Completed',
  },
   {
    id: 'serviceHoursRequired',
    numeric: false,
    disablePadding: false,
    label: 'Service Hours Required',
  },
   {
    id: 'serviceHoursCompleted',
    numeric: false,
    disablePadding: false,
    label: 'Service Hours Completed',
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
      </TableRow>
    </TableHead>
  );
}
interface EnhancedTableToolbarProps {
  numSelected: number;
}
function EnhancedTableToolbar(props: EnhancedTableToolbarProps) {
  const { numSelected } = props;
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
        <Tooltip title="Filter list">
          <IconButton>
            <FilterListIcon />
          </IconButton>
        </Tooltip>
      )}
    </Toolbar>
  );
}
export default function EnhancedTable({ members }: { members: string } ) {
  const [order, setOrder] = React.useState<Order>('asc');
  const [orderBy, setOrderBy] = React.useState<keyof Data>('dueStatus');
  const [selected, setSelected] = React.useState<readonly number[]>([]);
  const [page, setPage] = React.useState(0);
  const [dense, setDense] = React.useState(false);
  const [rowsPerPage, setRowsPerPage] = React.useState(5);

  const dummyData = [
  { "id": 1, 
    "firstName": "User", 
    "lastName": "Buser", 
    "dueStatus": 'Incomplete', 
    "amountPaid": 1, 
    "meetingsRequired": 2, 
    "meetingsCompleted": 3, 
    "openHoursRequired": 4, 
    "openHoursCompleted": 5,
    "serviceHoursRequired": 6,
    "serviceHoursCompleted": 7
  },
  { "id": 2, 
    "firstName": "User", 
    "lastName": "Buser", 
    "dueStatus": 'Incomplete', 
    "amountPaid": 8, 
    "meetingsRequired": 9, 
    "meetingsCompleted": 10, 
    "openHoursRequired": 11, 
    "openHoursCompleted": 12,
    "serviceHoursRequired": 13,
    "serviceHoursCompleted": 14
  },
]

  const [rows, setRows] = React.useState<Data[]>([
  createData(1, dummyData[0]["firstName"], "Duser", "Complete", 3, 4, 5, 6, 7, 8, 8),
  createData(2, "User2", "Buser", "Incomplete", 9, 10, 11, 12, 13, 14, 15)
  ])

  const handleRequestSort = (
    event: React.MouseEvent<unknown>,
    property: keyof Data,
  ) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const newSelected = rows.map((n) => n.id);
      setSelected(newSelected);
      return;
    }
    setSelected([]);
  };

  const handleClick = (event: React.MouseEvent<unknown>, id: number) => {
    const selectedIndex = selected.indexOf(id);
    let newSelected: readonly number[] = [];

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

  const handleChangeDense = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDense(event.target.checked);
  };

  // Avoid a layout jump when reaching the last page with empty rows.
  const emptyRows =
    page > 0 ? Math.max(0, (1 + page) * rowsPerPage - rows.length) : 0;

  const visibleRows = React.useMemo(
    () =>
      [...rows]
        .sort(getComparator(order, orderBy))
        .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [order, orderBy, page, rowsPerPage],
  );

  return (
    <Box sx={{ width: '100%' }}>
      <Paper sx={{ width: '100%', mb: 2 }}>
        <EnhancedTableToolbar numSelected={selected.length} />
        <TableContainer>
          <Table
            sx={{ minWidth: 750 }}
            aria-labelledby="tableTitle"
            size={dense ? 'small' : 'medium'}
          >
            <EnhancedTableHead
              numSelected={selected.length}
              order={order}
              orderBy={orderBy}
              onSelectAllClick={handleSelectAllClick}
              onRequestSort={handleRequestSort}
              rowCount={rows.length}
            />
            <TableBody>
              {visibleRows.map((row, index) => {
                const isItemSelected = selected.includes(row.id);
                const labelId = `enhanced-table-checkbox-${index}`;

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
                      {row.firstName}
                    </TableCell>
                    <TableCell
                      component="th"
                      id={labelId}
                      scope="row"
                      padding="none"
                    >
                      {row.lastName}
                    </TableCell>
                    <TableCell align="center">{row.dueStatus}</TableCell>
                    <TableCell align="center">{row.amountPaid}</TableCell>
                    <TableCell align="center">{row.meetingsRequired}</TableCell>
                    <TableCell align="center">{row.meetingsCompleted}</TableCell>
                    <TableCell align="center">{row.openHoursRequired}</TableCell>
                    <TableCell align="center">{row.openHoursCompleted}</TableCell>
                    <TableCell align="center">{row.serviceHoursRequired}</TableCell>
                    <TableCell align="center">{row.serviceHoursCompleted}</TableCell>
                  </TableRow>
                );
              })}
              {emptyRows > 0 && (
                <TableRow
                  style={{
                    height: (dense ? 33 : 53) * emptyRows,
                  }}
                >
                  <TableCell colSpan={6} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={rows.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>
      <FormControlLabel
        control={<Switch checked={dense} onChange={handleChangeDense} />}
        label="Dense padding"
      />
    </Box>
  );
}
