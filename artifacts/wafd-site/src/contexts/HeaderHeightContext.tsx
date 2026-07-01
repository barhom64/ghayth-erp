import { createContext, useContext, useState } from "react";

interface HeaderHeightContextType {
  announcementHeight: number;
  setAnnouncementHeight: (h: number) => void;
}

const HeaderHeightContext = createContext<HeaderHeightContextType>({
  announcementHeight: 0,
  setAnnouncementHeight: () => {},
});

export function HeaderHeightProvider({ children }: { children: React.ReactNode }) {
  const [announcementHeight, setAnnouncementHeight] = useState(0);
  return (
    <HeaderHeightContext.Provider value={{ announcementHeight, setAnnouncementHeight }}>
      {children}
    </HeaderHeightContext.Provider>
  );
}

export function useHeaderHeight() {
  return useContext(HeaderHeightContext);
}
