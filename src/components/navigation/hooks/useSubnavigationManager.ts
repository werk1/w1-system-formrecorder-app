import { useState, useCallback, useEffect } from 'react';

/**
 * Props for the useSubnavigationManager hook
 */
interface UseSubmenuManagerProps {
  /** If true, only one submenu can be open at a time */
  singleSubmenuMode: boolean;
  /** If true, all submenus will be closed */
  closeAllSubmenus: boolean;
  /** Indicates whether the popup menu is open */
  isPopupOpen: boolean;
}

/**
 * Custom hook for managing subnavigation in a navigation component
 *
 * @param {UseSubmenuManagerProps} props - The props for the hook
 * @returns {Object} An object containing the open subnavs and a function to handle subnavs
 */
export const useSubnavigationManager = ({
  singleSubmenuMode,
  closeAllSubmenus,
  isPopupOpen
}: UseSubmenuManagerProps) => {
  /** Set of indices representing open subnavs */
  const [openSubnav, setOpenSubnav] = useState<Set<number>>(new Set());

  /**
   * Handles toggling of submenus
   *
   * @param {number} index - The index of the submenu to toggle
   */
  const handleSubnavs = useCallback(
    (index: number) => {
      setOpenSubnav((prevOpenSubnavs) => {
        const newOpenSubnavs = new Set(prevOpenSubnavs);
        if (newOpenSubnavs.has(index)) {
          newOpenSubnavs.delete(index);
        } else {
          if (singleSubmenuMode) {
            newOpenSubnavs.clear();
          }
          newOpenSubnavs.add(index);
        }
        return newOpenSubnavs;
      });
    },
    [singleSubmenuMode]
  );

  /**
   * Effect to close all submenus when conditions are met
   */
  useEffect(() => {
    if (closeAllSubmenus || (!isPopupOpen && closeAllSubmenus)) {
      setOpenSubnav(new Set());
    } else if (!isPopupOpen && closeAllSubmenus) {
      handleSubnavs(-1); // This will close all submenus
    }
  }, [isPopupOpen, closeAllSubmenus, handleSubnavs]);

  return {
    openSubnav,
    handleSubnavs
  };
};
