import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, ListParams } from "../services/api";
import type { Discovery, PaginatedResult } from "../types";
import StatusBadge from "../components/StatusBadge";
import Pagination from "../components/Pagination";

export default function DiscoveryList() {
  const [data, setData] = useState<PaginatedResult<Discovery> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [params, setParams] = useState<ListParams>({
    page: 1,
    pageSize: 20,
    status: "",
    sortBy: "created_at",
    sortOrder: "desc",
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.discoveries.list(params);
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load discoveries",
      );
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusFilter = (status: string) => {
    setParams((p) => ({ ...p, status, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setParams((p) => ({ ...p, page }));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!data) return;
    const pendingIds = data.data
      .filter((d) => d.status === "pending")
      .map((d) => d.id);
    if (selected.size === pendingIds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingIds));
    }
  };

  const handleBulkApprove = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Approve ${selected.size} selected discoveries?`)) return;

    try {
      await api.discoveries.batchApprove(Array.from(selected));
      setSelected(new Set());
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  if (loading && !data) {
    return <div className="loading">Loading discoveries...</div>;
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <select
              className="select"
              value={params.status}
              onChange={(e) => handleStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {selected.size > 0 && (
            <button className="btn btn-success" onClick={handleBulkApprove}>
              Approve Selected ({selected.size})
            </button>
          )}
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: "40px" }}>
                <input
                  type="checkbox"
                  onChange={toggleSelectAll}
                  checked={
                    data &&
                    data.data.filter((d) => d.status === "pending").length >
                      0 &&
                    selected.size ===
                      data.data.filter((d) => d.status === "pending").length
                  }
                />
              </th>
              <th>Event Type</th>
              <th>Source</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.data.map((discovery) => (
              <tr key={discovery.id}>
                <td>
                  {discovery.status === "pending" && (
                    <input
                      type="checkbox"
                      checked={selected.has(discovery.id)}
                      onChange={() => toggleSelect(discovery.id)}
                    />
                  )}
                </td>
                <td>{discovery.event_type}</td>
                <td>{discovery.source_service}</td>
                <td>
                  <StatusBadge status={discovery.status} />
                </td>
                <td>{formatDate(discovery.created_at)}</td>
                <td>
                  <Link
                    to={`/discovery/${discovery.id}`}
                    className="btn btn-outline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {data?.data.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{ textAlign: "center", padding: "2rem" }}
                >
                  No discoveries found
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {data && data.totalPages > 1 && (
          <Pagination
            currentPage={data.page}
            totalPages={data.totalPages}
            onPageChange={handlePageChange}
          />
        )}
      </div>
    </div>
  );
}
