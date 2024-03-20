const {Transformer} = require('@parcel/plugin');
const {transform} = require('@svgr/core');
const path = require('path');
const tokens = require('@adobe/spectrum-tokens/dist/json/variables.json');

module.exports = new Transformer({
  async transform({asset}) {
    let contents = await asset.getCode();
    let iconName = path.basename(asset.filePath, '.svg');
    let optimized = (await transform(
      contents,
      {
        jsxRuntime: 'automatic',
        svgoConfig: {
          plugins: [
            {
              name: 'preset-default',
              params: {
                overrides: {
                  removeViewBox: false,
                  inlineStyles: {
                    onlyMatchedOnce: false,
                    removeMatchedSelectors: true
                  }
                }
              },
              removeAttrs: {
                attrs: ['id', 'data.*'] // data attribute removal not working
              }
            }
          ]
        },
        replaceAttrValues: {
          'var(--iconPrimary, #222)': `var(--iconPrimary, var(--lightningcss-light, ${tokens['gray-800'].sets.light.value}) var(--lightningcss-dark, ${tokens['gray-800'].sets.dark.value}))`
        },
        typescript: true,
        plugins: ['@svgr/plugin-svgo', '@svgr/plugin-jsx']
      })
    ).replace('export default SvgComponent;', '');
    // will need to use svgr's templating to add ref support if we want that https://github.com/facebook/create-react-app/pull/5457
    let newFile = template(asset, iconName, optimized);
    return [{
      type: 'tsx',
      content: newFile
    }];
  }
});

function template(asset, iconName, svg) {
  let importName = iconName.replace('S2_Icon_', '').replace(/_\d+\d+_N/, '');
  let iconRename = importName;
  if (/^[0-9]/.test(importName)) {
    iconRename = '_' + importName;
  }
  return (
`
import {IconProps, IconContext, IconContextValue} from '/src/Icon';
import {SVGProps, useRef} from 'react';
import {useContextProps} from 'react-aria-components';

${svg.replace('import type { SVGProps } from "react";', '')}

export default function ${iconRename}(props: IconProps) {
  let ref = useRef<SVGElement>(null);
  let ctx;
  // TODO: remove this default once we release RAC and use DEFAULT_SLOT.
  [ctx, ref] = useContextProps({slot: props.slot || 'icon'} as IconContextValue, ref, IconContext);
  let {render, css} = ctx;
  let {
    UNSAFE_className,
    UNSAFE_style,
    slot,
    'aria-label': ariaLabel,
    'aria-hidden': ariaHidden,
    ...otherProps
  } = props;

  if (!ariaHidden) {
    ariaHidden = undefined;
  }

  let svg = (
    <SvgComponent
      {...otherProps}
      focusable={false}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? (ariaHidden || undefined) : true}
      role="img"
      data-slot={slot}
      className={(UNSAFE_className ?? '') + ' ' + (css || '')}
      style={UNSAFE_style} />
  );

  if (render) {
    return render(svg);
  }

  return svg;
}

`
  );
}
