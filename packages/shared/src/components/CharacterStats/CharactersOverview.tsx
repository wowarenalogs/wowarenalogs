import { CombatUnitClass, CombatUnitSpec, getClassColor } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useMemo } from 'react';
import {
  LabelList,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Props } from 'recharts/types/component/Label';

import { UserCharacterInfo } from '../../graphql/__generated__/graphql';
import { Utils } from '../../utils/utils';

const ClassLabel = (props: {
  cx: number;
  cy: number;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  textAnchor: string;
  payload: { value: string };
}) => {
  const classId = parseInt(props.payload.value) as CombatUnitClass;
  const className =
    classId === CombatUnitClass.DeathKnight
      ? 'DK'
      : classId === CombatUnitClass.DemonHunter
      ? 'DH'
      : Utils.getClassName(classId);
  return (
    <g className="recharts-layer recharts-polar-angle-axis-tick">
      <text
        className="recharts-text recharts-polar-angle-axis-tick-value"
        fill={getClassColor(classId)}
        type="category"
        cx={props.cx}
        cy={props.cy}
        orientation="outer"
        radius={props.radius}
        x={props.x}
        y={props.y}
        textAnchor={props.textAnchor}
        fontWeight="bold"
      >
        <tspan x={props.x} dy="0em">
          {className}
        </tspan>
      </text>
    </g>
  );
};

const RatingLabel = (props: Props) => {
  if (props.value === 0) return null;
  return (
    <g className="recharts-layer recharts-polar-angle-axis-tick">
      <text
        className="recharts-text recharts-polar-angle-axis-tick-value"
        fill="#fff"
        type="category"
        cx={props.cx}
        cy={props.cy}
        orientation="outer"
        radius={props.radius}
        x={props.x}
        y={props.y}
        textAnchor={props.textAnchor}
      >
        <tspan x={props.x} dy="0em">
          {props.value}
        </tspan>
      </text>
    </g>
  );
};

export const CharactersOverview = (props: { characters: UserCharacterInfo[] }) => {
  const latestRatingPerClass = useMemo(() => {
    const data = _.map(
      _.groupBy(
        props.characters.flatMap((c) =>
          c.bracketStats.map((s) => ({ ...s, classId: Utils.getSpecClass(c.specId as CombatUnitSpec) })),
        ),
        'classId',
      ),
      (bracketStats, classId) => {
        return {
          classId,
          rating2v2:
            _.max(
              _.map(
                bracketStats.filter((s) => s.bracket === '2v2'),
                (s) => s.latestRating,
              ),
            ) ?? 0,
          rating3v3:
            _.max(
              _.map(
                bracketStats.filter((s) => s.bracket === '3v3'),
                (s) => s.latestRating,
              ),
            ) ?? 0,
          ratingShuffle:
            _.max(
              _.map(
                bracketStats.filter((s) => s.bracket === 'Rated Solo Shuffle'),
                (s) => s.latestRating,
              ),
            ) ?? 0,
        };
      },
    );

    const missingClasses = new Set<CombatUnitClass>();
    _.values(CombatUnitClass).forEach((k) => {
      if (typeof k === 'string') return;
      missingClasses.add(k);
    });
    data.forEach((d) => missingClasses.delete(parseInt(d.classId) as CombatUnitClass));
    missingClasses.delete(CombatUnitClass.None);

    missingClasses.forEach((classId) => {
      data.push({ classId: classId.toFixed(), rating2v2: 0, rating3v3: 0, ratingShuffle: 0 });
    });

    // Group characters that did shuffles first, then 3v3, then 2v2.
    // Within each group, sort by classId.
    // This is to minimize overlapping areas between the radars while doing best effort
    // to maintain a consistent order.
    return data.sort((a, b) => {
      return (
        parseInt(b.classId) +
        (b.ratingShuffle ? 100000 : b.rating3v3 ? 10000 : b.rating2v2 ? 1000 : 0) -
        (parseInt(a.classId) + (a.ratingShuffle ? 100000 : a.rating3v3 ? 10000 : a.rating2v2 ? 1000 : 0))
      );
    });
  }, [props.characters]);

  return (
    <div className="flex flex-col flex-1 min-h-full">
      <ResponsiveContainer>
        <RadarChart data={latestRatingPerClass}>
          <PolarGrid opacity={0.5} />
          <PolarAngleAxis
            dataKey="classId"
            stroke="#fff"
            tickLine={false}
            tickFormatter={(tick) => {
              return Utils.getClassName(parseInt(tick) as CombatUnitClass);
            }}
            tick={ClassLabel}
          />
          <PolarRadiusAxis
            angle={90}
            type="number"
            domain={[-300, 3000]}
            opacity={0.5}
            tickCount={3}
            tick={false}
            scale="pow"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1a1a1a',
            }}
            labelFormatter={(v: string) => {
              return Utils.getClassName(parseInt(v) as CombatUnitClass);
            }}
          />
          <Legend verticalAlign="top" />
          {latestRatingPerClass.find((d) => d.rating2v2) && (
            <Radar name="2v2" dataKey="rating2v2" stroke="#81C784" fill="#81C784" fillOpacity={0.5}>
              <LabelList dataKey="rating2v2" content={RatingLabel} />
            </Radar>
          )}
          {latestRatingPerClass.find((d) => d.rating3v3) && (
            <Radar name="3v3" dataKey="rating3v3" stroke="#64B5F6" fill="#64B5F6" fillOpacity={0.5}>
              <LabelList dataKey="rating3v3" content={RatingLabel} />
            </Radar>
          )}
          {latestRatingPerClass.find((d) => d.ratingShuffle) && (
            <Radar name="Shuffle" dataKey="ratingShuffle" stroke="#E57373" fill="#E57373" fillOpacity={0.5}>
              <LabelList dataKey="ratingShuffle" content={RatingLabel} />
            </Radar>
          )}
        </RadarChart>
      </ResponsiveContainer>
      <div className="text-center opacity-50">Data based on the lastest matches recorded by WoW Arena Logs.</div>
    </div>
  );
};
