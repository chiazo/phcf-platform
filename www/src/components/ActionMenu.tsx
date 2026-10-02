import { useState } from "react";
import type { ReactElement } from "react";
import { Link } from "react-router-dom";

import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

export interface ActionMenuItem {
  label: string;
  onClick?: () => void;
  to?: string; // in-app route
  href?: string; // external link, opens in a new tab
  dividerBefore?: boolean;
}

export default function ActionMenu({
  label,
  items,
  active = false,
}: {
  label: string;
  items: ActionMenuItem[];
  active?: boolean;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);

  return (
    <>
      <button
        type="button"
        className={`secondary${active ? " active-page" : ""}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        {label}
        <KeyboardArrowDownIcon
          fontSize="small"
          style={{ verticalAlign: "middle", marginLeft: 4 }}
        />
      </button>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        {items.flatMap((item) => {
          const entries: ReactElement[] = [];

          if (item.dividerBefore) {
            entries.push(<Divider key={`${item.label}-divider`} />);
          }

          if (item.to) {
            entries.push(
              <MenuItem
                key={item.label}
                component={Link}
                to={item.to}
                onClick={close}
              >
                {item.label}
              </MenuItem>,
            );
          } else if (item.href) {
            entries.push(
              <MenuItem
                key={item.label}
                component="a"
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
              >
                {item.label}
              </MenuItem>,
            );
          } else {
            entries.push(
              <MenuItem
                key={item.label}
                onClick={() => {
                  close();
                  item.onClick?.();
                }}
              >
                {item.label}
              </MenuItem>,
            );
          }

          return entries;
        })}
      </Menu>
    </>
  );
}
