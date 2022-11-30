import { ReactNode, useState } from 'react';

interface IDropdownMenuItem {
  key: string;
  label: ReactNode;
  onClick: () => void;
}

interface IProps {
  size?: 'sm' | 'md' | 'lg';
  align?: 'left' | 'right';
  placement?: 'top' | 'bottom';
  keepOpenOnMenuClick?: boolean;
  className?: string;
  children: ReactNode;
  menuItems: IDropdownMenuItem[];
}

export const Dropdown = (props: IProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className={`dropdown ${props.align === 'right' ? 'dropdown-end' : ''} ${
        props.placement === 'top' ? 'dropdown-top' : 'dropdown-bottom'
      } ${props.className ?? ''}`}
      onBlur={({ currentTarget, relatedTarget }) => {
        // currentTarget is the label
        // relatedTarget is the new focused element
        if (relatedTarget instanceof HTMLElement && currentTarget.contains(relatedTarget)) return;
        setIsOpen(false);
      }}
    >
      <label
        tabIndex={0}
        className={`btn ${props.size === 'lg' ? 'btn-lg' : props.size === 'md' ? 'btn-md' : 'btn-sm'}`}
        onClick={() => {
          setIsOpen((prev) => !prev);
        }}
      >
        {props.children}
      </label>
      <ul
        tabIndex={0}
        className="dropdown-content menu menu-compact shadow bg-base-300 rounded w-fit"
        style={{
          minWidth: '200px',
          visibility: isOpen ? 'visible' : 'hidden',
        }}
      >
        {props.menuItems.map((item) => (
          <li key={item.key}>
            <a
              onClick={() => {
                item.onClick();
                if (!props.keepOpenOnMenuClick) {
                  setIsOpen(false);
                }
              }}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};
