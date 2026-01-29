import React, { useState, useEffect } from "react";
import { Feature, Service } from "../service.ts";
import MissingFeatureBanner from "./MissingFeatureBanner.tsx";
import { getCoursesAndProgress, getSequence, titleToSlug, addProgressForActivity } from "../addProgress.ts";

interface Activity {
  activityId: string;
  activityType: string;
  selected: boolean;
}

interface SequenceItem {
  courseId: string;
  courseName: string;
  sequenceId: string;
  sequenceTitle: string;
  selected: boolean;
  expanded: boolean;
  activities: Activity[];
  loading: boolean;
}

interface TimeFormProps {
  service: Service | null;
  onError: (error: Error) => void;
}

export default function TimeForm({ service, onError }: TimeFormProps): JSX.Element {
  const [available, setAvailable] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sequences, setSequences] = useState<SequenceItem[]>([]);
  const [processing, setProcessing] = useState<boolean>(false);
  const [result, setResult] = useState<string | null>(null);

  // Load sequences from courses
  const handleLoadSequences = async () => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const data = await getCoursesAndProgress("fr-FR");
      if (!data?.data?.assignedCourses) {
        setError("No courses found");
        return;
      }

      const seqItems: SequenceItem[] = [];
      for (const course of data.data.assignedCourses) {
        if (course.sequences && course.sequences.length > 0) {
          for (const seq of course.sequences) {
            seqItems.push({
              courseId: course.courseId,
              courseName: course.title,
              sequenceId: seq.id,
              sequenceTitle: seq.title,
              selected: false,
              expanded: false,
              activities: [],
              loading: false,
            });
          }
        }
      }
      setSequences(seqItems);
      setResult(`Loaded ${seqItems.length} sequences`);
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      setError(errMsg);
      onError(err instanceof Error ? err : new Error(errMsg));
    } finally {
      setLoading(false);
    }
  };

  // Toggle sequence selection and expand to load activities
  const handleToggleSequence = async (index: number) => {
    const newSequences = [...sequences];
    const seq = newSequences[index];
    seq.selected = !seq.selected;

    // If selecting and not expanded, expand and load activities
    if (seq.selected && !seq.expanded) {
      seq.loading = true;
      setSequences(newSequences);

      try {
        const seqSlug = titleToSlug(seq.sequenceTitle);
        const seqData = await getSequence(seq.courseId, seqSlug, "fr-FR");

        if (seqData?.data?.sequence) {
          let activities = seqData.data.sequence.activities;
          if (typeof activities === "string") {
            activities = JSON.parse(activities);
          }

          if (Array.isArray(activities)) {
            seq.activities = activities.map((act: any) => ({
              activityId: act.activityId,
              activityType: act.activityType || "unknown",
              selected: false,
            }));
          }
        }

        seq.expanded = true;
        seq.loading = false;
      } catch (err: any) {
        console.error(`Failed to load activities for ${seq.sequenceTitle}:`, err);
        seq.loading = false;
      }
    } else if (!seq.selected) {
      // Deselect all activities when deselecting sequence
      seq.activities = seq.activities.map((act) => ({ ...act, selected: false }));
    }

    setSequences(newSequences);
  };

  // Toggle activity selection
  const handleToggleActivity = (seqIndex: number, actIndex: number) => {
    setSequences((prev) => {
      const newSeqs = [...prev];
      newSeqs[seqIndex].activities[actIndex].selected = !newSeqs[seqIndex].activities[actIndex].selected;
      return newSeqs;
    });
  };

  // Select all sequences
  const handleSelectAll = () => {
    setSequences((prev) => prev.map((seq) => ({ ...seq, selected: true })));
  };

  // Deselect all sequences
  const handleDeselectAll = () => {
    setSequences((prev) =>
      prev.map((seq) => ({
        ...seq,
        selected: false,
        activities: seq.activities.map((act) => ({ ...act, selected: false })),
      }))
    );
  };

  // Process selected sequences and activities
  const handleProcessSelected = async () => {
    let totalActivities = 0;
    for (const seq of sequences) {
      if (seq.selected) {
        totalActivities += seq.activities.filter((a) => a.selected).length;
      }
    }

    if (totalActivities === 0) {
      setError("Please select at least one activity in a sequence");
      return;
    }

    setProcessing(true);
    setResult(`Processing ${totalActivities} activities...\n`);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const seq of sequences) {
        if (!seq.selected) continue;

        const selectedActivities = seq.activities.filter((a) => a.selected);
        if (selectedActivities.length === 0) continue;

        try {
          const seqSlug = titleToSlug(seq.sequenceTitle);
          const seqData = await getSequence(seq.courseId, seqSlug, "fr-FR");

          if (!seqData?.data?.sequence) {
            setResult(
              (prev) => prev + `✗ ${seq.courseName} > ${seq.sequenceTitle}: No sequence data\n`
            );
            errorCount += selectedActivities.length;
            continue;
          }

          const sequence = seqData.data.sequence;
          let activities = sequence.activities;

          if (typeof activities === "string") {
            activities = JSON.parse(activities);
          }

          if (!Array.isArray(activities)) {
            activities = [];
          }

          let stepsProcessed = 0;
          for (const selectedAct of selectedActivities) {
            const activity = activities.find((a: any) => a.activityId === selectedAct.activityId);
            if (!activity) continue;

            if (activity.steps && Array.isArray(activity.steps)) {
              for (const step of activity.steps) {
                try {
                  await addProgressForActivity(
                    seq.courseId,
                    sequence.sequenceId,
                    activity.activityId,
                    step.activityStepId,
                    1
                  );
                  stepsProcessed++;
                } catch (e) {
                  // Log but continue
                }
              }
              successCount++;
            } else {
              // Fallback: no steps
              try {
                await addProgressForActivity(
                  seq.courseId,
                  sequence.sequenceId,
                  activity.activityId,
                  activity.activityId,
                  1
                );
                stepsProcessed++;
                successCount++;
              } catch (e) {
                errorCount++;
              }
            }
          }

          setResult(
            (prev) =>
              prev +
              `✓ ${seq.courseName} > ${seq.sequenceTitle}: ${stepsProcessed} steps from ${selectedActivities.length} activities\n`
          );
        } catch (err: any) {
          const errMsg = err?.message ?? String(err);
          setResult(
            (prev) =>
              prev +
              `✗ ${seq.courseName} > ${seq.sequenceTitle}: ${errMsg}\n`
          );
          errorCount += selectedActivities.length;
        }
      }

      setResult((prev) => prev + `\n✓ Complete! ${successCount} succeeded, ${errorCount} failed`);
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      setError(errMsg);
      onError(err instanceof Error ? err : new Error(errMsg));
    } finally {
      setProcessing(false);
    }
  };

  useEffect(() => {
    if (!service) return;
    let mounted = true;
    service
      .isFeatureReady(Feature.AddTime)
      .then((ready) => mounted && setAvailable(ready))
      .catch(() => mounted && setAvailable(false));
    return () => {
      mounted = false;
    };
  }, [service]);

  if (!available) {
    return <MissingFeatureBanner message="ajouter du temps" />;
  }

  const selectedActivitiesCount = sequences.reduce(
    (count, seq) => count + seq.activities.filter((a) => a.selected).length,
    0
  );

  return (
    <div className="container">
      <div className="section">
        <h2>Add Progress to Activities</h2>

        <button onClick={handleLoadSequences} disabled={loading} className="btn btn-primary">
          {loading ? "Loading..." : "Load Sequences"}
        </button>

        {error && <div className="alert alert-error">{error}</div>}

        {sequences.length > 0 && (
          <div className="sequences-section">
            <div className="controls">
              <button onClick={handleSelectAll} className="btn btn-small">
                Select All
              </button>
              <button onClick={handleDeselectAll} className="btn btn-small">
                Deselect All
              </button>
              <span className="counter">
                {selectedActivitiesCount} activities selected
              </span>
            </div>

            <div className="sequences-list">
              {sequences.map((seq, seqIdx) => (
                <div key={seqIdx} className="sequence-group">
                  <label className="sequence-item">
                    <input
                      type="checkbox"
                      checked={seq.selected}
                      onChange={() => handleToggleSequence(seqIdx)}
                    />
                    <span className="course-name">{seq.courseName}</span>
                    <span className="sequence-name">{seq.sequenceTitle}</span>
                    {seq.loading && <span className="loading">loading...</span>}
                    {seq.selected && seq.activities.length > 0 && (
                      <span className="activity-count">({seq.activities.length})</span>
                    )}
                  </label>

                  {seq.selected && seq.activities.length > 0 && (
                    <div className="activities-list">
                      {seq.activities.map((activity, actIdx) => (
                        <label key={actIdx} className="activity-item">
                          <input
                            type="checkbox"
                            checked={activity.selected}
                            onChange={() => handleToggleActivity(seqIdx, actIdx)}
                          />
                          <span className="activity-type">{activity.activityType}</span>
                          <span className="activity-id" title={activity.activityId}>
                            {activity.activityId.substring(0, 8)}...
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={handleProcessSelected}
              disabled={processing || selectedActivitiesCount === 0}
              className="btn btn-success"
            >
              {processing ? "Processing..." : "Add Progress to Selected Activities"}
            </button>
          </div>
        )}

        {result && (
          <div className="result">
            <pre>{result}</pre>
          </div>
        )}
      </div>

      <style jsx>{`
        .container {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          max-width: 700px;
          margin: 20px auto;
          padding: 20px;
        }

        .section {
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          padding: 20px;
        }

        h2 {
          margin: 0 0 20px 0;
          font-size: 20px;
          color: #333;
        }

        .btn {
          padding: 10px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-primary {
          background: #007bff;
          color: #fff;
          width: 100%;
          margin-bottom: 16px;
        }

        .btn-primary:hover:not(:disabled) {
          background: #0056b3;
        }

        .btn-small {
          background: #6c757d;
          color: #fff;
          padding: 6px 12px;
          font-size: 12px;
          margin-right: 8px;
        }

        .btn-small:hover:not(:disabled) {
          background: #545b62;
        }

        .btn-success {
          background: #28a745;
          color: #fff;
          width: 100%;
          margin-top: 16px;
        }

        .btn-success:hover:not(:disabled) {
          background: #218838;
        }

        .alert {
          padding: 12px;
          border-radius: 4px;
          margin-bottom: 16px;
        }

        .alert-error {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }

        .sequences-section {
          margin-top: 16px;
        }

        .controls {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
          align-items: center;
        }

        .counter {
          margin-left: auto;
          font-size: 12px;
          color: #666;
          font-weight: 500;
        }

        .sequences-list {
          border: 1px solid #ddd;
          border-radius: 4px;
          max-height: 600px;
          overflow-y: auto;
          margin-bottom: 16px;
        }

        .sequence-group {
          border-bottom: 1px solid #eee;
        }

        .sequence-item {
          display: flex;
          align-items: center;
          padding: 10px 12px;
          cursor: pointer;
          user-select: none;
          transition: background 0.1s;
          font-weight: 500;
        }

        .sequence-item:hover {
          background: #f8f9fa;
        }

        .sequence-item input[type="checkbox"] {
          margin-right: 12px;
          cursor: pointer;
          width: 16px;
          height: 16px;
        }

        .course-name {
          font-size: 13px;
          color: #666;
          margin-right: 8px;
          min-width: 150px;
        }

        .sequence-name {
          font-size: 13px;
          color: #333;
          flex: 1;
        }

        .activity-count {
          font-size: 12px;
          color: #999;
          margin-left: 8px;
        }

        .loading {
          font-size: 12px;
          color: #17a2b8;
          margin-left: 8px;
          font-style: italic;
        }

        .activities-list {
          background: #f8f9fa;
          border-top: 1px solid #ddd;
        }

        .activity-item {
          display: flex;
          align-items: center;
          padding: 8px 12px 8px 40px;
          cursor: pointer;
          user-select: none;
          transition: background 0.1s;
          border-bottom: 1px solid #eee;
          font-size: 12px;
        }

        .activity-item:hover {
          background: #e9ecef;
        }

        .activity-item input[type="checkbox"] {
          margin-right: 12px;
          margin-left: -28px;
          cursor: pointer;
          width: 14px;
          height: 14px;
        }

        .activity-type {
          color: #666;
          min-width: 140px;
        }

        .activity-id {
          color: #999;
          font-family: monospace;
          font-size: 11px;
          flex: 1;
        }

        .result {
          background: #f8f9fa;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 12px;
          margin-top: 16px;
          max-height: 300px;
          overflow-y: auto;
        }

        .result pre {
          margin: 0;
          font-size: 12px;
          line-height: 1.5;
          color: #333;
          white-space: pre-wrap;
          word-wrap: break-word;
        }
      `}</style>
    </div>
  );
}