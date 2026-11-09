import MoodRoundedIcon from "@mui/icons-material/MoodRounded";
import SentimentDissatisfiedRoundedIcon from "@mui/icons-material/SentimentDissatisfiedRounded";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import { alpha } from "@mui/material/styles";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import TextField from "@mui/material/TextField";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { visuallyHidden } from "@mui/utils";
import * as React from "react";
import { downloadCsv } from "../lib/csv"
import { Link } from "react-router-dom";
import { displayNotes, summarizeRequirements } from "../lib/requirements";


interface Data {
  id: string;
  member_id: string;
  fullName: string;
  memberType: string;
  joinDate: number;
  boxNumber: number; // 0 = no box
  queueRank: number; // 0 = not waiting
  changeRequestLetter: string;
  dueStatus: string;
  duesStatusMet: string;
  duesPaidAt: number;
  amountPaid: number;
  meetingsRequired: number;
  meetingsCompleted: number;
  meetingsRemaining: number;
  meetingsRequiredMet: string;
  workHoursRequired: number;
  workHoursCompleted: number;
  workHoursRemaining: number;
  openHoursRequired: number;
  openHoursCompleted: number;
  openHoursRemaining: number;
  serviceHoursMet: string; // "hours met", name kept for the filters
  workFormulaStatus: boolean;
  allMemberRequirementsMet: string;
  rolloverEligible: string;
  notes: string;
  standingLabel: string;
}

function yesNo(value: boolean): string {
  return value ? "YES" : "NO";
}


function formatDatePaid(unixSeconds: unknown): string {
  const seconds = Number(unixSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return new Date(seconds * 1000).toISOString().slice(0, 10); // YYYY-MM-DD
}

function toRow(
  member: Record<string, any>,
  formula: Record<string, any> | null,
  boxNumber: number,
  queueRank: number,
): Data {
  const personalInfo = member.personal_info ?? {};
  const memberInfo = member.member_info ?? {};
  const dues = memberInfo.dues ?? {};
  const s = summarizeRequirements(member, formula);

  // No formula row means no requirement we can check, so don't call it met
  const hoursMet = formula ? s.hoursMet : false;
  const meetingsMet = s.meetingsRemaining === 0;

  return {
    id: member.id,
    member_id: member.member_id ?? "",
    fullName: `${personalInfo.firstName ?? ""} ${personalInfo.lastName ?? ""}`.trim(),
    memberType: memberInfo.memberType ?? "",
    joinDate: Number(memberInfo.joinDate) || 0,
    boxNumber,
    queueRank,
    changeRequestLetter: member.box_info?.changeRequestLetter ?? "",
    dueStatus: dues.dueState ?? "",
    duesStatusMet: yesNo(s.duesPaid),
    duesPaidAt: Number(dues.duesPaidAt) || 0,
    amountPaid: Number(dues.amountPaid) || 0,
    meetingsRequired: s.meetingsRequired,
    meetingsCompleted: s.meetingsAttended,
    meetingsRemaining: s.meetingsRemaining,
    meetingsRequiredMet: yesNo(meetingsMet),
    workHoursRequired: s.workRequired,
    workHoursCompleted: s.workDone,
    workHoursRemaining: s.workRemaining,
    openHoursRequired: s.openRequired,
    openHoursCompleted: s.openDone,
    openHoursRemaining: s.openRemaining,
    serviceHoursMet: yesNo(hoursMet),
    workFormulaStatus: hoursMet,
    allMemberRequirementsMet: yesNo(s.duesPaid && meetingsMet && hoursMet),
    rolloverEligible: memberInfo.rolloverEligible ?? "",
    notes: displayNotes(memberInfo),
    standingLabel: s.duesPaid && meetingsMet && hoursMet ? "Yes" : "In Progress",
  };
}


type Order = "asc" | "desc";

type RequirementFilter =
  | "serviceHoursMet"
  | "meetingsRequiredMet"
  | "duesStatusMet"
  | "allMemberRequirementsMet";

type FilterState = "any" | "met" | "unmet";

const requirementFilters: Array<{
  id: RequirementFilter;
  label: string;
}> = [
    { id: "serviceHoursMet", label: "Service hours" },
    { id: "meetingsRequiredMet", label: "Meetings" },
    { id: "duesStatusMet", label: "Dues status" },
    { id: "allMemberRequirementsMet", label: "All requirements" },
  ];

const noFilters: Record<RequirementFilter, FilterState> = {
  serviceHoursMet: "any",
  meetingsRequiredMet: "any",
  duesStatusMet: "any",
  allMemberRequirementsMet: "any",
};
function descendingComparator<T>(
  a: T,
  b: T,
  orderBy: keyof T,
): number {
  const aValue = a[orderBy];
  const bValue = b[orderBy];

  if (typeof aValue === "boolean" && typeof bValue === "boolean") {
    return Number(bValue) - Number(aValue);
  }

  if (typeof aValue === "number" && typeof bValue === "number") {
    return bValue - aValue;
  }

  const aString = String(aValue ?? "").toLowerCase();
  const bString = String(bValue ?? "").toLowerCase();

  return bString.localeCompare(aString, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function getComparator<T>(
  order: Order,
  orderBy: keyof T,
): (a: T, b: T) => number {
  return order === "desc"
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
  { id: "fullName", numeric: false, disablePadding: true, label: "Full Name" },
  { id: "memberType", numeric: false, disablePadding: false, label: "Member Type" },
  { id: "joinDate", numeric: false, disablePadding: false, label: "Join Date" },
  { id: "boxNumber", numeric: true, disablePadding: false, label: "Box Number" },
  { id: "queueRank", numeric: true, disablePadding: false, label: "Waitlist #" },
  { id: "changeRequestLetter", numeric: false, disablePadding: false, label: "Box Change Request" },
  { id: "dueStatus", numeric: false, disablePadding: false, label: "Dues Status" },
  { id: "duesPaidAt", numeric: false, disablePadding: false, label: "Dues Paid: Date" },
  { id: "amountPaid", numeric: true, disablePadding: false, label: "Amount Paid" },
  { id: "meetingsRequired", numeric: true, disablePadding: false, label: "Meetings Required" },
  { id: "meetingsCompleted", numeric: true, disablePadding: false, label: "Meetings Attended" },
  { id: "meetingsRemaining", numeric: true, disablePadding: false, label: "Meetings Remaining" },
  { id: "workHoursRequired", numeric: true, disablePadding: false, label: "Total Service Hours Required" },
  { id: "openHoursRequired", numeric: true, disablePadding: false, label: "Total Open Hours Required" },
  { id: "openHoursRemaining", numeric: true, disablePadding: false, label: "Total Open Hours Remaining" },
  { id: "workHoursRemaining", numeric: true, disablePadding: false, label: "Total Service Hours Remaining" },
  { id: "standingLabel", numeric: false, disablePadding: false, label: "Good Standing" },
  { id: "rolloverEligible", numeric: false, disablePadding: false, label: "Rollover Eligible" },
  { id: "workFormulaStatus", numeric: false, disablePadding: false, label: "Hour Status" },
  { id: "notes", numeric: false, disablePadding: false, label: "Notes" },
];

interface EnhancedTableProps {
  numSelected: number;
  onRequestSort: (
    event: React.MouseEvent<unknown>,
    property: keyof Data,
  ) => void;
  onSelectAllClick: (event: React.ChangeEvent<HTMLInputElement>) => void;
  order: Order;
  orderBy: string;
  rowCount: number;
}

function EnhancedTableHead(props: EnhancedTableProps) {
  const {
    onSelectAllClick,
    order,
    orderBy,
    numSelected,
    rowCount,
    onRequestSort,
  } = props;
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
              input: { "aria-label": "select all desserts" },
            }}
          />
        </TableCell>
        {headCells.map((headCell) => (
          <TableCell
            key={headCell.id}
            className="table-header"
            align={headCell.numeric ? "right" : "left"}
            padding={headCell.disablePadding ? "none" : "normal"}
            sortDirection={orderBy === headCell.id ? order : false}
          >
            <TableSortLabel
              active={orderBy === headCell.id}
              direction={orderBy === headCell.id ? order : "asc"}
              onClick={createSortHandler(headCell.id)}
            >
              {headCell.label}
              {orderBy === headCell.id ? (
                <Box component="span" sx={visuallyHidden}>
                  {order === "desc" ? "sorted descending" : "sorted ascending"}
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

  function displayModal() {
    const modal = document.getElementById("myModal");

    if (modal) {
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
            alpha(
              theme.palette.primary.main,
              theme.palette.action.activatedOpacity,
            ),
        },
      ]}
    >
      {numSelected > 0 ? (
        <Typography
          variant="subtitle1"
          component="div"
          sx={{
            color: "inherit",
            flex: "1 1 100%",
          }}
        >
          {numSelected} selected
        </Typography>
      ) : (
        <Typography
          sx={{ flex: "1 1 100%" }}
          variant="h6"
          id="tableTitle"
          component="div"
        >
          Prospect Heights Community Farm Members
        </Typography>
      )}
      {/* {numSelected > 0 ? (
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
      )} */}
    </Toolbar>
  );
}
export default function EnhancedTable({
  members,
  work_formulas,
  boxNumberByMember = {},
  queueByMember = {},
}: {
  members: Array<Record<string, any>>;
  work_formulas: Array<Record<string, any> | null>;
  boxNumberByMember?: Record<string, number>;
  queueByMember?: Record<string, number>;
}) {
  const [order, setOrder] = React.useState<Order>("asc");
  const [orderBy, setOrderBy] = React.useState<keyof Data>("dueStatus");
  const [selected, setSelected] = React.useState<readonly string[]>([]);
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(30);
  const [filterValues, setFilterValues] =
    React.useState<Record<RequirementFilter, FilterState>>(noFilters);


  const handleRequestSort = (
    event: React.MouseEvent<unknown>,
    property: keyof Data,
  ) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

  const allRows = React.useMemo(() => {
    const formulaByMemberId = new Map<string, Record<string, any>>();
    for (const wf of work_formulas) {
      if (wf?.member_id && !formulaByMemberId.has(wf.member_id)) {
        formulaByMemberId.set(wf.member_id, wf);
      }
    }

    return members.map((member) =>
      toRow(
        member,
        formulaByMemberId.get(member.member_id) ?? null,
        boxNumberByMember[member.member_id] ?? 0,
        queueByMember[member.member_id] ?? 0,
      ),
    );
  }, [members, work_formulas, boxNumberByMember, queueByMember]);


  const filteredRows = React.useMemo(
    () =>
      allRows.filter((row) =>
        requirementFilters.every(({ id }) => {
          const wanted = filterValues[id];
          if (wanted === "any") return true;
          return row[id] === (wanted === "met" ? "YES" : "NO");
        }),
      ),
    [filterValues, allRows],
  );

  const detailsById = React.useMemo(
    () =>
      new Map(
        members.map(
          (m): [string, { email: string; paymentType: string; datePaid: string }] => [
            m.id,
            {
              email: m.personal_info?.emailInfo?.primaryEmail ?? "",
              paymentType: String(
                m.member_info?.dues?.paymentType ?? "",
              ).toUpperCase(),
              datePaid: formatDatePaid(m.member_info?.dues?.duesPaidAt),
            },
          ],
        ),
      ),
    [members],
  );

  const handleExportFiltered = () => {
    const includePaymentType =
      filterValues.duesStatusMet === "met" ||
      filterValues.allMemberRequirementsMet === "met";

    const header = [
      "Full Name",
      "Email",
      "Member Type",
      "Join Date",
      "Box Number",
      "Waitlist #",

      "Box Change Request",
      "Dues Status",
      "Dues Paid: Date",
      "Amount Paid",

      ...(includePaymentType ? ["Payment Type"] : []),

      "Meetings Required",
      "Meetings Attended",
      "Meetings Remaining",

      "Total Service Hours Required",
      "Total Open Hours Required",
      "Total Open Hours Remaining",
      "Total Service Hours Remaining",

      "Good Standing",
      "Rollover Eligible",
      "Notes",

    ];

    const rows = [...filteredRows]
      .sort(getComparator(order, orderBy))
      .map((row) => {
        const details = detailsById.get(row.id);

        return [
          row.fullName,
          details?.email ?? "",
          row.memberType,
          formatDatePaid(row.joinDate),
          row.boxNumber || "",
          row.queueRank || "",
          row.changeRequestLetter,
          row.dueStatus,
          formatDatePaid(row.duesPaidAt),
          row.amountPaid,
          ...(includePaymentType ? [details?.paymentType ?? ""] : []),
          row.meetingsRequired,
          row.meetingsCompleted,
          row.meetingsRemaining,
          row.workHoursRequired,
          row.openHoursRequired,
          row.openHoursRemaining,
          row.workHoursRemaining,
          row.standingLabel,
          row.rolloverEligible,
          row.notes,
        ];
      });

    downloadCsv(
      `members-filtered-${new Date().toISOString().slice(0, 10)}.csv`,
      header,
      rows,
    );
  };

  const anyFilterActive = Object.values(filterValues).some((v) => v !== "any");

  const handleFilterChange =
    (filterId: RequirementFilter) =>
      (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFilterValues((current) => ({
          ...current,
          [filterId]: event.target.value as FilterState,
        }));
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

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
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
      <Box sx={{ width: "100%" }}>
        <Paper sx={{ width: "100%", mb: 2 }}>
          <EnhancedTableToolbar numSelected={selected.length} />
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 2,
              px: 2,
              py: 1.5,
              borderTop: 1,
              borderColor: "divider",
            }}
          >
            <Typography component="span" sx={{ fontWeight: 600 }}>
              Filters:
            </Typography>

            {requirementFilters.map((filter) => (
              <TextField
                key={filter.id}
                select
                size="small"
                label={filter.label}
                value={filterValues[filter.id]}
                onChange={handleFilterChange(filter.id)}
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="any">Any</MenuItem>
                <MenuItem value="met">Met</MenuItem>
                <MenuItem value="unmet">Not met</MenuItem>
              </TextField>
            ))}

            {anyFilterActive && (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<FileDownloadIcon />}
                  disabled={filteredRows.length === 0}
                  onClick={handleExportFiltered}
                >
                  Export {filteredRows.length}{" "}
                  {filteredRows.length === 1 ? "member" : "members"}
                </Button>

                <Button
                  size="small"
                  onClick={() => {
                    setFilterValues(noFilters);
                    setPage(0);
                  }}
                >
                  Clear filters
                </Button>
              </>
            )}
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
                  const workFormula = work_formulas.find(
                    (wf) => wf?.member_id === row.member_id,
                  );

                  return (
                    <TableRow
                      hover
                      onClick={(event) => handleClick(event, row.id)}
                      role="checkbox"
                      aria-checked={isItemSelected}
                      tabIndex={-1}
                      key={row.id}
                      selected={isItemSelected}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          color="primary"
                          checked={isItemSelected}
                          slotProps={{
                            input: { "aria-labelledby": labelId },
                          }}
                        />
                      </TableCell>
                      <TableCell
                        component="th"
                        id={labelId}
                        scope="row"
                        padding="none"
                      >
                        <Link to={`/snapshot/${row.id}`}>{row.fullName}</Link>
                      </TableCell>
                      <TableCell align="center">{row.memberType || "—"}</TableCell>
                      <TableCell align="center">{formatDatePaid(row.joinDate) || "—"}</TableCell>
                      <TableCell align="center">{row.boxNumber || "—"}</TableCell>
                      <TableCell align="center">{row.queueRank || "—"}</TableCell>
                      <TableCell align="center">{row.changeRequestLetter || "—"}</TableCell>
                      <TableCell align="center">{row.dueStatus}</TableCell>
                      <TableCell align="center">{formatDatePaid(row.duesPaidAt) || "—"}</TableCell>
                      <TableCell align="center">{row.amountPaid}</TableCell>
                      <TableCell align="center">{row.meetingsRequired}</TableCell>
                      <TableCell align="center">{row.meetingsCompleted}</TableCell>
                      <TableCell align="center">{row.meetingsRemaining}</TableCell>
                      <TableCell align="center">{row.workHoursRequired}</TableCell>
                      <TableCell align="center">{row.openHoursRequired}</TableCell>
                      <TableCell align="center">{row.openHoursRemaining}</TableCell>
                      <TableCell align="center">{row.workHoursRemaining}</TableCell>
                      <TableCell align="center">{row.standingLabel}</TableCell>
                      <TableCell align="center">{row.rolloverEligible || "—"}</TableCell>
                      <TableCell align="center">
                        {workFormula ? (
                          row.workFormulaStatus ? (
                            <MoodRoundedIcon sx={{ color: "green" }} />
                          ) : (
                            <SentimentDissatisfiedRoundedIcon sx={{ color: "red" }} />
                          )
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                      <TableCell align="center">{row.notes || "—"}</TableCell>
                    </TableRow>
                  );
                })}
                {emptyRows > 0 && (
                  <TableRow
                    style={{
                      height: 53 * emptyRows,
                    }}
                  >
                    <TableCell colSpan={headCells.length + 1} />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[10, 20, 30]}
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
