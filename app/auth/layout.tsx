import { NextPage } from "next";

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="w-full custom-gradient min-h-screen flex items-center justify-center">
      {children}
    </div>
  );
};

export default Layout;
