const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="w-full bg-[#F4F6FA] min-h-screen flex flex-col ">
      {children}
    </div>
  );
};

export default DashboardLayout;
