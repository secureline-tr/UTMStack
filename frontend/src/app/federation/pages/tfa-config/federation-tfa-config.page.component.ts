import {Component, OnInit} from '@angular/core';
import {UtmConfigParamsService} from '../../../shared/services/config/utm-config-params.service';
import {SectionConfigParamType} from '../../../shared/types/configuration/section-config-param.type';
import {
  FEDERATION_TFA_CONFIG_PARAMS,
  FEDERATION_TFA_CONFIG_SECTION
} from './federation-tfa-config-section.const';

@Component({
  selector: 'app-federation-tfa-config-page',
  templateUrl: './federation-tfa-config.page.component.html'
})
export class FederationTfaConfigPageComponent implements OnInit {
  readonly section = FEDERATION_TFA_CONFIG_SECTION;
  readonly params: SectionConfigParamType[] = FEDERATION_TFA_CONFIG_PARAMS.map(p => ({...p}));

  constructor(private paramsService: UtmConfigParamsService) {}

  ngOnInit(): void {
    this.paramsService.query({
      page: 0,
      size: 10000,
      'sectionId.equals': this.section.id,
      sort: 'id,asc'
    }).subscribe(response => {
      const byShort = new Map<string, SectionConfigParamType>();
      (response.body || []).forEach(p => byShort.set(p.confParamShort, p));
      this.params.forEach(p => {
        const server = byShort.get(p.confParamShort);
        if (server) {
          p.id = server.id;
          p.confParamValue = server.confParamValue;
        }
      });
    });
  }
}
