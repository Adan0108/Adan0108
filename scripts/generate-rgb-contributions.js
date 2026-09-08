const fs = require("fs");
const path = require("path");

const username = process.env.GITHUB_USERNAME || "Adan0108";
const token = process.env.GITHUB_TOKEN;

const outputDirectory = path.join(process.cwd(), "dist");
const outputFile = path.join(
  outputDirectory,
  "rgb-contributions.svg"
);

const query = `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              contributionLevel
              weekday
            }
          }
        }
      }
    }
  }
`;

const rgbColours = [
  "#5b8cff",
  "#8b7cff",
  "#c675ff",
  "#ff77b7",
  "#ff8674",
  "#ffd166",
  "#62d9c7",
  "#55c8ff",
  "#5b8cff"
];

const contributionOpacity = {
  NONE: 0.14,
  FIRST_QUARTILE: 0.5,
  SECOND_QUARTILE: 0.68,
  THIRD_QUARTILE: 0.84,
  FOURTH_QUARTILE: 1
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchContributionCalendar() {
  if (!token) {
    throw new Error("GITHUB_TOKEN is missing.");
  }

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "rgb-contribution-profile"
    },
    body: JSON.stringify({
      query,
      variables: {
        login: username
      }
    })
  });

  if (!response.ok) {
    throw new Error(
      `GitHub GraphQL request failed: ${response.status}`
    );
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(
      result.errors.map((error) => error.message).join("; ")
    );
  }

  if (!result.data.user) {
    throw new Error(`GitHub user "${username}" was not found.`);
  }

  return result.data.user
    .contributionsCollection
    .contributionCalendar;
}

function createColourSequence(phase) {
  const colours = [...rgbColours];
  const body = colours.slice(0, -1);

  const offset = phase % body.length;

  const rotated = [
    ...body.slice(offset),
    ...body.slice(0, offset)
  ];

  rotated.push(rotated[0]);

  return rotated.join(";");
}

function renderMonthLabels(
  weeks,
  left,
  top,
  cellSize,
  gap
) {
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];

  const labels = [];
  let previousMonth = null;

  weeks.forEach((week, weekIndex) => {
    const firstDay = week.contributionDays[0];

    if (!firstDay) {
      return;
    }

    const month = new Date(
      `${firstDay.date}T00:00:00Z`
    ).getUTCMonth();

    if (month !== previousMonth) {
      const x =
        left +
        weekIndex * (cellSize + gap);

      labels.push(`
        <text x="${x}" y="${top - 11}">
          ${monthNames[month]}
        </text>
      `);

      previousMonth = month;
    }
  });

  return labels.join("");
}

function renderWeekdayLabels(
  left,
  top,
  cellSize,
  gap
) {
  const labels = [
    { name: "Mon", weekday: 1 },
    { name: "Wed", weekday: 3 },
    { name: "Fri", weekday: 5 }
  ];

  return labels
    .map(({ name, weekday }) => {
      const y =
        top +
        weekday * (cellSize + gap) +
        cellSize -
        1;

      return `
        <text
          x="${left - 12}"
          y="${y}"
          text-anchor="end"
        >
          ${name}
        </text>
      `;
    })
    .join("");
}

function renderContributionCells(
  weeks,
  left,
  top,
  cellSize,
  gap
) {
  const cells = [];

  /*
   * Duration of one complete wave moving
   * across the contribution calendar.
   */
  const waveDuration = 14;

  weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach((day) => {
      const x =
        left +
        weekIndex * (cellSize + gap);

      const y =
        top +
        day.weekday * (cellSize + gap);

      const level =
        day.contributionLevel || "NONE";

      const hasContribution =
        day.contributionCount > 0;

      const contributionLevelOpacity =
        contributionOpacity[level] ??
        contributionOpacity.NONE;

      /*
       * Each column receives a different RGB colour.
       * The wave reveals these colours while travelling.
       */
      const phase =
        (weekIndex + day.weekday) %
        (rgbColours.length - 1);

      const nodeColour =
        rgbColours[phase];

      /*
       * Columns are delayed progressively so that
       * the pulse appears to travel horizontally.
       *
       * All seven nodes in one week use almost the
       * same delay, forming a vertical wave band.
       */
      const waveDelay = -(
        weekIndex * 0.22 +
        day.weekday * 0.015
      ).toFixed(3);

      /*
       * Empty nodes remain extremely subtle.
       */
      const emptyNodeOpacity = 0.07;

      /*
       * Wave opacity is intentionally lower than
       * every real contribution node.
       */
      const waveMinimumOpacity = 0.015;
      const waveOuterOpacity = 0.08;
      const waveMiddleOpacity = 0.17;
      const wavePeakOpacity = 0.28;

      /*
       * Real contribution brightness.
       * The minimum real contribution is brighter
       * than the maximum wave opacity of 0.28.
       */
      const contributionNodeOpacity =
        hasContribution
          ? Math.max(
            contributionLevelOpacity,
            0.5
          )
          : emptyNodeOpacity;

      const contributionStrokeOpacity =
        hasContribution
          ? Math.min(
            contributionNodeOpacity + 0.18,
            1
          )
          : 0.1;

      const title =
        `${day.date}: ` +
        `${day.contributionCount} contribution` +
        `${day.contributionCount === 1 ? "" : "s"}`;

      cells.push(`
        <g>
          <title>${escapeXml(title)}</title>

          <!--
            Layer 1: subtle permanent background.
            Empty contribution nodes remain visible.
          -->
          <rect
            x="${x}"
            y="${y}"
            width="${cellSize}"
            height="${cellSize}"
            rx="2.5"
            fill="#30363d"
            fill-opacity="${emptyNodeOpacity}"
            stroke="#8b949e"
            stroke-opacity="0.1"
            stroke-width="0.35"
          />

          <!--
            Layer 2: travelling RGB wave.

            The opacity pattern creates:
            dim → outer wave → middle wave →
            bright centre → middle wave → outer wave → dim
          -->
          <rect
            x="${x}"
            y="${y}"
            width="${cellSize}"
            height="${cellSize}"
            rx="2.5"
            fill="${nodeColour}"
            opacity="${waveMinimumOpacity}"
            pointer-events="none"
            filter="url(#wave-glow)"
          >
            <animate
              attributeName="opacity"
              values="
                ${waveMinimumOpacity};
                ${waveMinimumOpacity};
                ${waveOuterOpacity};
                ${waveMiddleOpacity};
                ${wavePeakOpacity};
                ${waveMiddleOpacity};
                ${waveOuterOpacity};
                ${waveMinimumOpacity};
                ${waveMinimumOpacity}
              "
              keyTimes="
                0;
                0.28;
                0.36;
                0.43;
                0.5;
                0.57;
                0.64;
                0.72;
                1
              "
              dur="${waveDuration}s"
              begin="${waveDelay}s"
              repeatCount="indefinite"
              calcMode="linear"
            />
          </rect>

          ${hasContribution
          ? `
          <!--
            Layer 3: real contribution node.

            This layer is rendered after the wave,
            so the wave can never cover the real commit.
          -->
          <rect
            x="${x}"
            y="${y}"
            width="${cellSize}"
            height="${cellSize}"
            rx="2.5"
            fill="${nodeColour}"
            fill-opacity="${contributionNodeOpacity}"
            stroke="#ffffff"
            stroke-opacity="${contributionStrokeOpacity}"
            stroke-width="0.75"
            filter="url(#commit-glow)"
          />
          `
          : ""
        }
        </g>
      `);
    });
  });

  return cells.join("");
}

function renderLegend(width) {
  const levels = [
    {
      label: "No commit",
      opacity: contributionOpacity.NONE
    },
    {
      label: "",
      opacity: contributionOpacity.FIRST_QUARTILE
    },
    {
      label: "",
      opacity: contributionOpacity.SECOND_QUARTILE
    },
    {
      label: "",
      opacity: contributionOpacity.THIRD_QUARTILE
    },
    {
      label: "More",
      opacity: contributionOpacity.FOURTH_QUARTILE
    }
  ];

  const startX = width - 205;

  const boxes = levels
    .map((level, index) => {
      const x = startX + 55 + index * 17;

      return `
        <rect
          x="${x}"
          y="164"
          width="11"
          height="11"
          rx="2.5"
          fill="${rgbColours[index]}"
          fill-opacity="${level.opacity}"
          stroke="#ffffff"
          stroke-opacity="${level.opacity}"
          stroke-width="0.5"
        />
      `;
    })
    .join("");

  return `
    <text
      x="${startX}"
      y="174"
      fill="#8b949e"
      font-size="10"
    >
      Less
    </text>

    ${boxes}

    <text
      x="${startX + 147}"
      y="174"
      fill="#8b949e"
      font-size="10"
    >
      More
    </text>
  `;
}

function renderSvg(calendar) {
  const cellSize = 11;
  const gap = 4;
  const left = 48;
  const top = 51;

  const weeks = calendar.weeks;

  const width =
    left +
    25 +
    weeks.length * (cellSize + gap);

  const height = 190;

  const monthLabels = renderMonthLabels(
    weeks,
    left,
    top,
    cellSize,
    gap
  );

  const weekdayLabels = renderWeekdayLabels(
    left,
    top,
    cellSize,
    gap
  );

  const cells = renderContributionCells(
    weeks,
    left,
    top,
    cellSize,
    gap
  );

  const legend = renderLegend(width);

  return `<?xml version="1.0" encoding="UTF-8"?>

<svg
  width="${width}"
  height="${height}"
  viewBox="0 0 ${width} ${height}"
  xmlns="http://www.w3.org/2000/svg"
  role="img"
  aria-labelledby="title description"
>
  <title id="title">
    ${escapeXml(username)} RGB contribution graph
  </title>

  <desc id="description">
    GitHub contribution graph where every cell transitions
    through a soft RGB colour sequence. Real contributions
    appear brighter according to their contribution level.
  </desc>

  <defs>
    <!-- Soft glow for the travelling wave -->
    <filter
      id="wave-glow"
      x="-100%"
      y="-100%"
      width="300%"
      height="300%"
    >
      <feGaussianBlur
        stdDeviation="1.7"
        result="waveBlur"
      />

      <feMerge>
        <feMergeNode in="waveBlur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <!-- Slightly stronger glow for real commits -->
    <filter
      id="commit-glow"
      x="-100%"
      y="-100%"
      width="300%"
      height="300%"
    >
      <feGaussianBlur
        stdDeviation="1.05"
        result="commitBlur"
      />

      <feMerge>
        <feMergeNode in="commitBlur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <rect
    width="${width}"
    height="${height}"
    rx="10"
    fill="#0d1117"
    stroke="#30363d"
    stroke-width="1"
  />

  <text
    x="${left}"
    y="25"
    fill="#f0f6fc"
    font-family="Segoe UI, Inter, Arial, sans-serif"
    font-size="15"
    font-weight="600"
  >
    ${calendar.totalContributions} contributions in the last year
  </text>

  <g
    fill="#8b949e"
    font-family="Segoe UI, Inter, Arial, sans-serif"
    font-size="10"
  >
    ${monthLabels}
    ${weekdayLabels}
  </g>

  <g shape-rendering="geometricPrecision">
    ${cells}
  </g>

  <g
    font-family="Segoe UI, Inter, Arial, sans-serif"
  >
    ${legend}
  </g>
</svg>`;
}

async function main() {
  const calendar =
    await fetchContributionCalendar();

  const svg = renderSvg(calendar);

  fs.mkdirSync(
    outputDirectory,
    { recursive: true }
  );

  fs.writeFileSync(
    outputFile,
    svg,
    "utf8"
  );

  console.log(
    `Generated ${outputFile}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});