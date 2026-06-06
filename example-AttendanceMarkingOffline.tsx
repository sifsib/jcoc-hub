/**
 * NOTE: This is an example/reference file and should not be imported.
 * Offline attendance functionality is not yet implemented.
 */
  memberName: string;
  status: 'present' | 'absent' | 'late';
  date: string;
  serviceType: 'sunday' | 'tuesday';
}

interface AttendanceMarkingProps {
  date: string;
  serviceType: 'sunday' | 'tuesday';
  members: Array<{ id: string; firstName: string; lastName: string }>;
}

export function AttendanceMarking({
  date,
  serviceType,
  members
}: AttendanceMarkingProps) {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const isOnline = useOnlineStatus();
  const { getAttendanceByDate, markAttendance, loading, error } = useOfflineAttendance(
    tenantId || ''
  );

  const [attendance, setAttendance] = useState<Map<string, string>>(new Map());
  const [initialLoad, setInitialLoad] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load existing attendance records
  useEffect(() => {
    const loadAttendance = async () => {
      if (!tenantId) return;
      try {
        const records = await getAttendanceByDate(date);
        const map = new Map<string, string>();
        records.forEach((record: AttendanceRecord) => {
          map.set(record.memberId, record.status);
        });
        setAttendance(map);
      } catch (err) {
        console.error('Failed to load attendance:', err);
      } finally {
        setInitialLoad(false);
      }
    };

    loadAttendance();
  }, [date, tenantId, getAttendanceByDate]);

  const handleStatusChange = async (memberId: string, status: string) => {
    if (!tenantId) return;

    // Update local state immediately for responsiveness
    const newAttendance = new Map(attendance);
    newAttendance.set(memberId, status);
    setAttendance(newAttendance);

    try {
      // Queue for sync (offline or online)
      const attendanceId = `${date}#${serviceType}#${memberId}`;
      await markAttendance(attendanceId, {
        memberId,
        date,
        serviceType,
        status,
        tenantId,
        markedAt: new Date().toISOString(),
        markedBy: user?.uid
      });
      setSaveError(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to mark attendance');
    }
  };

  if (initialLoad) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block animate-spin">Loading attendance...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status indicators */}
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <span className="font-medium">{isOnline ? 'Online' : 'Offline'}</span>
        </div>
        {!isOnline && (
          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
            Changes saved locally
          </span>
        )}
      </div>

      {/* Error messages */}
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded border border-red-200 text-sm">
          {error}
        </div>
      )}
      {saveError && (
        <div className="p-3 bg-amber-50 text-amber-700 rounded border border-amber-200 text-sm">
          {saveError}
        </div>
      )}

      {/* Attendance table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b">
              <th className="px-4 py-2 text-left text-sm font-semibold">Member</th>
              <th className="px-4 py-2 text-center text-sm font-semibold">Present</th>
              <th className="px-4 py-2 text-center text-sm font-semibold">Late</th>
              <th className="px-4 py-2 text-center text-sm font-semibold">Absent</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map(member => {
              const status = attendance.get(member.id) || '';
              return (
                <tr key={member.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-sm">
                    {member.firstName} {member.lastName}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="radio"
                      name={`attendance-${member.id}`}
                      value="present"
                      checked={status === 'present'}
                      onChange={() => handleStatusChange(member.id, 'present')}
                      disabled={loading}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="radio"
                      name={`attendance-${member.id}`}
                      value="late"
                      checked={status === 'late'}
                      onChange={() => handleStatusChange(member.id, 'late')}
                      disabled={loading}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="radio"
                      name={`attendance-${member.id}`}
                      value="absent"
                      checked={status === 'absent'}
                      onChange={() => handleStatusChange(member.id, 'absent')}
                      disabled={loading}
                      className="cursor-pointer"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 text-center p-4 bg-slate-50 rounded">
        <div>
          <div className="text-2xl font-bold text-green-600">
            {Array.from(attendance.values()).filter(s => s === 'present').length}
          </div>
          <div className="text-xs text-slate-600">Present</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-amber-600">
            {Array.from(attendance.values()).filter(s => s === 'late').length}
          </div>
          <div className="text-xs text-slate-600">Late</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-red-600">
            {Array.from(attendance.values()).filter(s => s === 'absent').length}
          </div>
          <div className="text-xs text-slate-600">Absent</div>
        </div>
      </div>
    </div>
  );
}
