// This should be called from the service with a captured request
// For now, we'll create a helper that uses the stored request pattern

import { Request } from "../lib/request.ts";

// Helper to create a proper GraphQL request
export function createProgressRequest(baseRequest: Request): Request {
  const req = { ...baseRequest };
  
  const body = JSON.parse(req.body || "{}");
  
  // Update the mutation with fresh data
  body.variables.messages = body.variables.messages.map((msg: any) => ({
    ...msg,
    activityAttemptId: generateUUID(),
    activityStepAttemptId: generateUUID(),
    endTimestamp: new Date().toISOString(),
    durationMs: 745
  }));
  
  req.body = JSON.stringify(body);
  return req;
}

// UUID v4 generator
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Direct fetch approach if no request is available
const YOUR_AUTH_TOKEN = "b4e31b36-a3c0-4f6f-9953-17bf3090e4fb";

// Helper to convert title to slug (e.g., "Concertar una cita" → "concertar-una-cita")
export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumeric with dash
    .replace(/^-|-$/g, ''); // trim dashes
}

export async function getCoursesAndProgress(locale: string): Promise<any> {
  if (!locale) throw new Error('locale is required');
  if (!YOUR_AUTH_TOKEN) throw new Error('Authentication token is missing.');

  const body = {
    operationName: 'getCoursesAndProgress',
    variables: {locale},
    query: `query getCoursesAndProgress($locale: String) {\n  assignedCourses {\n    ...CoursesDetails\n    __typename\n  }\n  progress {\n    id\n    courseId\n    countOfSequencesInCourse\n    sequences {\n      id\n      percentComplete\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment CoursesDetails on Course {\n  id\n  courseId\n  productId\n  learningLanguage\n  title(locale: $locale)\n  cefr\n  description(locale: $locale)\n  images {\n    ...Images\n    __typename\n  }\n  topics {\n    id\n    color\n    localizations {\n      id\n      locale\n      text\n      __typename\n    }\n    images {\n      ...Images\n      __typename\n    }\n    __typename\n  }\n  sequences {\n    id\n    title(locale: $locale)\n    interaction\n    images {\n      ...Images\n      __typename\n    }\n    numberOfActivities\n    __typename\n  }\n  __typename\n}\n\nfragment Images on ImageArray {\n  id\n  type\n  images {\n    id\n    type\n    media_uri\n    __typename\n  }\n  __typename\n}\n`,
  };

  const res = await fetch('https://gaia-server.rosettastone.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${YOUR_AUTH_TOKEN}`,
      'Origin': 'https://learn.rosettastone.com',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP error ${res.status}: ${t}`);
  }

  const data = await res.json();
  if (data.errors) throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  return data;
}

export async function getSequence(courseId: string, sequenceSlug: string, locale: string): Promise<any> {
  if (!courseId || !sequenceSlug || !locale) throw new Error('courseId, sequenceSlug, and locale are required');
  if (!YOUR_AUTH_TOKEN) throw new Error('Authentication token is missing.');

  const body = {
    operationName: 'getSequence',
    variables: { courseId, sequenceSlug, locale },
    query: `query getSequence($courseId: String!, $sequenceId: String, $sequenceSlug: String, $locale: String) {
  sequence(courseId: $courseId, sequenceId: $sequenceId, slug: $sequenceSlug, locale: $locale) {
    id
    sequenceId
    title(locale: $locale)
    version
    activities
    __typename
  }
}`,
  };

  const res = await fetch('https://gaia-server.rosettastone.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${YOUR_AUTH_TOKEN}`,
      'Origin': 'https://learn.rosettastone.com',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP error ${res.status}: ${t}`);
  }

  const data = await res.json();
  if (data.errors) throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  return data;
}

export async function addProgressForActivity(
  courseId: string, 
  sequenceId: string, 
  activityId: string,
  activityStepId: string,
  score: number = 1
): Promise<any> {
  if (!courseId || !sequenceId || !activityId || !activityStepId) {
    throw new Error('courseId, sequenceId, activityId, and activityStepId are required');
  }
  if (!YOUR_AUTH_TOKEN) throw new Error('Authentication token is missing.');

  // Try to reuse the captured request stored by the background worker
  try {
    const store = await browser.storage.session.get('fluency_builder_time_request');
    const storedReq = store['fluency_builder_time_request'] as Request | undefined;
    if (storedReq && storedReq.body) {
      const reqCopy: Request = { ...storedReq };
      const bodyObj = JSON.parse(reqCopy.body);

      // Update the message fields with the current activity details
      if (Array.isArray(bodyObj.variables?.messages) && bodyObj.variables.messages.length > 0) {
        bodyObj.variables.messages = bodyObj.variables.messages.map((msg: any) => ({
          ...msg,
          courseId,
          sequenceId,
          activityId,
          activityStepId,
          score,
          activityAttemptId: generateUUID(),
          activityStepAttemptId: generateUUID(),
          endTimestamp: new Date().toISOString(),
        }));
      } else {
        bodyObj.variables = bodyObj.variables || {};
        bodyObj.variables.messages = [
          {
            userAgent: navigator.userAgent,
            courseId,
            sequenceId,
            version: 1,
            activityId,
            activityAttemptId: generateUUID(),
            activityStepId,
            activityStepAttemptId: generateUUID(),
            answers: [],
            score,
            skip: false,
            durationMs: 745,
            endTimestamp: new Date().toISOString(),
          },
        ];
      }

      reqCopy.body = JSON.stringify(bodyObj);

      // Execute fetch in the page context to preserve Origin header
      const reqStr = JSON.stringify(reqCopy);
      const tab = await (await import('../lib/product.ts')).getTab();
      const results = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        args: [reqStr],
        func: async (reqStr: string) => {
          const req = JSON.parse(reqStr);
          const res = await fetch(req.url, {
            method: req.method,
            headers: req.headers,
            body: req.body,
          });
          const text = await res.text();
          return { status: res.status, ok: res.ok, text };
        },
      });

      return results?.[0]?.result;
    }
  } catch (e) {
    // fall back to direct fetch if storage or executeScript fails
    console.debug('Failed to use stored request, falling back to direct fetch', e);
  }

  // Fallback: craft and send a direct GraphQL request
  const msg = {
    userAgent: navigator.userAgent || "Mozilla/5.0",
    courseId,
    sequenceId,
    version: 1,
    activityId,
    activityAttemptId: generateUUID(),
    activityStepId,
    activityStepAttemptId: generateUUID(),
    answers: [],
    score,
    skip: false,
    durationMs: 745,
    endTimestamp: new Date().toISOString(),
  };

  const body = {
    operationName: 'AddProgress',
    variables: {
      userId: '8c1694c1-cea8-404a-acc6-5f2f629942b8',
      messages: [msg],
    },
    query: `mutation AddProgress($userId: String!, $messages: [ProgressMessage!]!) {
  progress(userId: $userId, messages: $messages) {
    id
    __typename
  }
}`,
  };

  const res = await fetch('https://gaia-server.rosettastone.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${YOUR_AUTH_TOKEN}`,
      'Origin': 'https://learn.rosettastone.com',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP error ${res.status}: ${t}`);
  }

  const data = await res.json();
  if (data.errors) throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  return data;
}

/**
 * Main function to be called when addProgress button is clicked
 * Flow:
 * 1. Fetch getCoursesAndProgress to get all courseIds
 * 2. For each courseId, fetch getSequence to get sequence ids and activities
 * 3. For each activity, call addProgress
 */
export async function processAllProgress(locale: string = "fr-FR"): Promise<void> {
  try {
    console.log('Step 1: Fetching courses and progress...');
    const coursesData = await getCoursesAndProgress(locale);
    
    if (!coursesData?.data?.assignedCourses) {
      throw new Error('No courses found');
    }

    const courses = coursesData.data.assignedCourses;
    console.log(`Found ${courses.length} courses`);

    // Process each course
    for (const course of courses) {
      const courseId = course.courseId;
      console.log(`\nProcessing course: ${courseId} - ${course.title}`);

      // Get all sequences for this course
      if (!course.sequences || course.sequences.length === 0) {
        console.log(`No sequences found for course ${courseId}`);
        continue;
      }

      // Process each sequence
      for (const seq of course.sequences) {
        const sequenceSlug = titleToSlug(seq.title);
        console.log(`  Processing sequence: ${seq.title} (${sequenceSlug})`);

        try {
          console.log('Step 2: Fetching sequence details...');
          const sequenceData = await getSequence(courseId, sequenceSlug, locale);
          
          if (!sequenceData?.data?.sequence) {
            console.log(`    No sequence data found for ${sequenceSlug}`);
            continue;
          }

          const sequence = sequenceData.data.sequence;
          let activities = sequence.activities;
          
          // Parse activities if it's a JSON string
          if (typeof activities === 'string') {
            try {
              activities = JSON.parse(activities);
            } catch (e) {
              console.warn(`    Could not parse activities JSON:`, e);
              activities = [];
            }
          }
          
          if (!Array.isArray(activities) || activities.length === 0) {
            console.log(`    No activities found for sequence ${sequenceSlug}`);
            continue;
          }

          console.log(`    Found ${activities.length} activities`);

          // Process each activity
          for (let i = 0; i < activities.length; i++) {
            const activity = activities[i];
            console.log(`    Step 3: Processing activity ${i + 1}/${activities.length}: ${activity.activityId}`);

            try {
              // Add progress for each activity step
              if (activity.steps && Array.isArray(activity.steps) && activity.steps.length > 0) {
                for (const step of activity.steps) {
                  await addProgressForActivity(
                    courseId,
                    sequence.sequenceId,
                    activity.activityId,
                    step.activityStepId,
                    1 // score
                  );
                  console.log(`      ✓ Added progress for step: ${step.activityStepId}`);
                }
              } else {
                // If no steps, use activity ID as step ID (fallback)
                await addProgressForActivity(
                  courseId,
                  sequence.sequenceId,
                  activity.activityId,
                  activity.activityId, // using activityId as stepId
                  1 // score
                );
                console.log(`      ✓ Added progress for activity: ${activity.activityId}`);
              }
            } catch (activityError) {
              console.error(`      ✗ Failed to add progress for activity ${activity.activityId}:`, activityError);
            }
          }
        } catch (sequenceError) {
          console.error(`  ✗ Failed to process sequence ${sequenceSlug}:`, sequenceError);
        }
      }
    }

    console.log('\n✓ All progress processing complete!');
  } catch (error) {
    console.error('✗ Error processing progress:', error);
    throw error;
  }
}